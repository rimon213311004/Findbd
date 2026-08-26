/**
 * The API client.
 *
 * Two decisions carry most of the weight here.
 *
 * The access token lives in a module binding and nowhere else — not
 * `localStorage`, not `sessionStorage`, not a readable cookie. Any XSS on the page
 * can read all three, and a token that survives a page reload is a token an
 * attacker can exfiltrate and use later. The cost is that a refresh has to happen
 * on every page load; `AuthProvider` does exactly one, against the httpOnly
 * cookie, which script cannot touch.
 *
 * And a 401 triggers *one* refresh, shared by every request that is waiting.
 * Without the shared promise, a dashboard that fires five requests at once on a
 * stale token would fire five refreshes — and because refresh rotates the token
 * family, four of them would arrive with a token the server has already rotated
 * and be treated as a replay. The whole session would be revoked. This has to be
 * a single flight, not merely an optimisation.
 */

export interface FieldError {
  path: string;
  message: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors: FieldError[];

  constructor(status: number, code: string, message: string, fieldErrors: FieldError[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }

  /** The message for one field, so a form can render it inline. */
  forField(path: string): string | undefined {
    return this.fieldErrors.find((e) => e.path === path)?.message;
  }
}

let accessToken: string | null = null;
let onSessionLost: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function hasAccessToken(): boolean {
  return accessToken !== null;
}

/** Called when a refresh fails, so `AuthProvider` can clear the user. */
export function setSessionLostHandler(fn: (() => void) | null): void {
  onSessionLost = fn;
}

/* ------------------------------------------------------------------ refresh */

let inFlightRefresh: Promise<boolean> | null = null;

async function refreshOnce(): Promise<boolean> {
  inFlightRefresh ??= (async () => {
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        accessToken = null;
        return false;
      }
      const data = (await res.json()) as { accessToken: string };
      accessToken = data.accessToken;
      return true;
    } catch {
      accessToken = null;
      return false;
    } finally {
      // Cleared in a microtask so everyone awaiting this attempt shares its
      // result, while the next 401 after it starts a fresh one.
      queueMicrotask(() => {
        inFlightRefresh = null;
      });
    }
  })();

  return inFlightRefresh;
}

/** Refresh deliberately, on page load. Returns the access token or null. */
export async function restoreSession(): Promise<string | null> {
  const ok = await refreshOnce();
  return ok ? accessToken : null;
}

/* -------------------------------------------------------------------- fetch */

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** A `FormData` body: sent as-is, with no Content-Type so the browser sets it. */
  form?: FormData;
  signal?: AbortSignal;
  /** Skip the refresh-and-retry dance. Used by the auth calls themselves. */
  noRetry?: boolean;
}

async function toApiError(res: Response): Promise<ApiError> {
  let code = 'REQUEST_FAILED';
  let message = `Request failed (${res.status})`;
  const fieldErrors: FieldError[] = [];

  try {
    const data = (await res.json()) as {
      error?: { code?: string; message?: string; details?: unknown };
    };
    if (data.error) {
      code = data.error.code ?? code;
      message = data.error.message ?? message;

      /**
       * `details` is Zod's flattened `fieldErrors` — a record of field name to
       * messages, exactly as `validate()` sends it. Flattening keeps only the
       * top-level key, so a bad answer inside `privateIdentifiers[0]` reports
       * against `privateIdentifiers`. That is the right granularity for a form
       * that renders one error line per field group.
       */
      const details = data.error.details;
      if (details && typeof details === 'object' && !Array.isArray(details)) {
        for (const [path, messages] of Object.entries(details as Record<string, unknown>)) {
          const first = Array.isArray(messages) ? messages[0] : messages;
          if (typeof first === 'string') fieldErrors.push({ path, message: first });
        }
      }
    }
  } catch {
    // A non-JSON error body (a proxy timeout, say) keeps the generic message.
  }

  return new ApiError(res.status, code, message, fieldErrors);
}

async function send<T>(path: string, options: RequestOptions, retrying: boolean): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  let body: BodyInit | undefined;
  if (options.form) {
    body = options.form;
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  const res = await fetch(path, {
    method: options.method ?? 'GET',
    headers,
    body,
    credentials: 'include',
    signal: options.signal,
  });

  if (res.status === 401 && !retrying && !options.noRetry) {
    if (await refreshOnce()) return send<T>(path, options, true);
    onSessionLost?.();
  }

  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;

  return (await res.json()) as T;
}

export function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  return send<T>(path, { method: 'GET', signal }, false);
}

export function apiPost<T>(path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
  return send<T>(path, { ...options, method: 'POST', body }, false);
}

export function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return send<T>(path, { method: 'PATCH', body }, false);
}

export function apiDelete<T>(path: string): Promise<T> {
  return send<T>(path, { method: 'DELETE' }, false);
}

export function apiUpload<T>(path: string, form: FormData): Promise<T> {
  return send<T>(path, { method: 'POST', form }, false);
}

/** Build a query string, dropping every empty value. */
export function qs(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const out = search.toString();
  return out ? `?${out}` : '';
}
