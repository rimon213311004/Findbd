'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from './api';

/**
 * Two hooks, because almost every screen here is one of two shapes: load data and
 * show it, or take a form and submit it.
 *
 * `useLoader` aborts the previous request when its key changes. On the search page
 * that is not a nicety — typing "Samsung" fires six requests, and without the
 * abort the answer to "Samsu" can arrive after the answer to "Samsung" and
 * overwrite it. The list would then show results for a query the user has already
 * finished typing.
 */

interface LoaderState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

export function useLoader<T>(
  load: (signal: AbortSignal) => Promise<T>,
  deps: unknown[],
  options: { enabled?: boolean } = {},
): LoaderState<T> {
  const enabled = options.enabled ?? true;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [nonce, setNonce] = useState(0);

  // Kept in a ref so a caller can pass an inline arrow without re-running.
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    loadRef
      .current(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        // An abort surfaces as an error; it is not one, and showing it would put
        // "The user aborted a request" on screen every time someone types.
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(messageOf(err));
        setLoading(false);
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { data, error, loading, reload };
}

interface ActionState<TArgs extends unknown[], TResult> {
  run: (...args: TArgs) => Promise<TResult | undefined>;
  pending: boolean;
  error: string | null;
  /** Per-field messages from a 422, keyed by field name. */
  fieldErrors: Record<string, string>;
  reset: () => void;
}

export function useAction<TArgs extends unknown[], TResult>(
  action: (...args: TArgs) => Promise<TResult>,
): ActionState<TArgs, TResult> {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const actionRef = useRef(action);
  actionRef.current = action;

  const run = useCallback(async (...args: TArgs) => {
    setPending(true);
    setError(null);
    setFieldErrors({});
    try {
      return await actionRef.current(...args);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.fieldErrors.length > 0) {
        setFieldErrors(Object.fromEntries(err.fieldErrors.map((e) => [e.path, e.message])));
      }
      setError(messageOf(err));
      return undefined;
    } finally {
      setPending(false);
    }
  }, []);

  const reset = useCallback(() => {
    setError(null);
    setFieldErrors({});
  }, []);

  return { run, pending, error, fieldErrors, reset };
}

function messageOf(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof TypeError) return 'Could not reach the server. Check your connection.';
  if (err instanceof Error) return err.message;
  return 'Something went wrong.';
}

/** Delay a fast-changing value — one request per pause in typing, not per key. */
export function useDebounced<T>(value: T, ms = 320): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);

  return debounced;
}
