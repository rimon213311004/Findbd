'use client';

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import Link from 'next/link';

type Tone = 'lost' | 'found' | 'neutral';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

/* ------------------------------------------------------------------ buttons */

const BUTTON_BASE =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-5 text-sm font-semibold ' +
  'transition-all duration-150 active:translate-y-px ' +
  'disabled:pointer-events-none disabled:opacity-45 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marigold';

const BUTTON_VARIANTS = {
  primary: 'bg-marigold text-ink hover:bg-[#ffc352] shadow-md shadow-marigold/20',
  lost: 'bg-rose text-white hover:bg-[#fb5b74] shadow-md shadow-rose/20',
  found: 'bg-emerald text-ink hover:bg-[#2bd39b] shadow-md shadow-emerald/20',
  outline: 'border border-ink-4 text-paper hover:border-marigold hover:text-marigold',
  paper: 'border border-ink/15 bg-ink/5 text-ink hover:bg-ink/10',
  ghost: 'text-paper-3 hover:text-paper',
  danger: 'border border-rose/45 text-rose hover:bg-rose/12',
} as const;

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof BUTTON_VARIANTS;
}

export function Button({ variant = 'primary', className, ...rest }: ButtonProps) {
  return <button className={cx(BUTTON_BASE, BUTTON_VARIANTS[variant], className)} {...rest} />;
}

interface ButtonLinkProps {
  href: string;
  variant?: keyof typeof BUTTON_VARIANTS;
  className?: string;
  children: ReactNode;
}

export function ButtonLink({ href, variant = 'primary', className, children }: ButtonLinkProps) {
  return (
    <Link href={href} className={cx(BUTTON_BASE, BUTTON_VARIANTS[variant], className)}>
      {children}
    </Link>
  );
}

/* ------------------------------------------------------------------- fields */

interface FieldProps {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

export function Field({ label, htmlFor, hint, error, required, children, className }: FieldProps) {
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-[0.8125rem] font-semibold text-ink">
        {label}
        {required && <span className="ml-1 text-rose">*</span>}
      </label>
      {children}
      {error ? (
        <p className="text-xs font-medium text-rose" role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-ink-3">{hint}</p>
      )}
    </div>
  );
}

const CONTROL =
  'min-h-11 w-full rounded-md border bg-white px-3 py-2 text-[0.9375rem] text-ink ' +
  'placeholder:text-ink-3 transition-all duration-150 focus:border-marigold focus:outline-none focus:ring-1 focus:ring-marigold/40';

export function Input({ className, invalid, ...rest }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input className={cx(CONTROL, invalid ? 'border-rose' : 'border-ink-4', className)} {...rest} />;
}

export function Textarea({
  className,
  invalid,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return (
    <textarea
      className={cx(CONTROL, 'min-h-28 resize-y leading-relaxed', invalid ? 'border-rose' : 'border-ink-4', className)}
      {...rest}
    />
  );
}

export function Select({
  className,
  invalid,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <select
      className={cx(CONTROL, 'appearance-none pr-9', invalid ? 'border-rose' : 'border-ink-4', className)}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%234a4a4a' d='M6 8 0 0h12z'/%3E%3C/svg%3E\")",
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 0.75rem center',
      }}
      {...rest}
    >
      {children}
    </select>
  );
}

/* ------------------------------------------------------------------- badges */

const TONE_BADGE: Record<Tone, string> = {
  lost: 'border-rose/45 bg-rose/12 text-rose',
  found: 'border-emerald/45 bg-emerald/12 text-emerald',
  neutral: 'border-ink-4 bg-ink-3 text-paper-3',
};

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        'eyebrow inline-flex items-center rounded-full border px-2.5 py-1 leading-none',
        TONE_BADGE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function PaperBadge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  const tones: Record<Tone, string> = {
    lost: 'bg-rose/15 text-[#a5122b] border-rose/35',
    found: 'bg-emerald/15 text-[#0a6b4d] border-emerald/35',
    neutral: 'bg-ink/8 text-ink/65 border-ink/15',
  };
  return (
    <span
      className={cx(
        'eyebrow inline-flex items-center rounded-full border px-2.5 py-1 leading-none',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ notices */

export function Notice({
  children,
  className,
  tilt = 0,
  pinned = false,
}: {
  children: ReactNode;
  className?: string;
  tilt?: number;
  pinned?: boolean;
}) {
  return (
    <div
      className={cx('notice', pinned && 'notice-pinned', className)}
      style={tilt ? { rotate: `${tilt}deg` } : undefined}
    >
      {children}
    </div>
  );
}

/* ----------------------------------------------------------------- feedback */

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cx(
        'inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent',
        className,
      )}
    />
  );
}

export function Alert({ children, tone = 'error', className }: { children: ReactNode; tone?: 'error' | 'info'; className?: string }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cx(
        'rounded-md border px-4 py-3 text-sm',
        tone === 'error'
          ? 'border-rose/50 bg-rose/10 text-[#ffc2cd]'
          : 'border-marigold/40 bg-marigold/10 text-[#ffe0a3]',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-6 px-4 py-14 text-center sm:py-20">
      <Notice tilt={-1.5} className="w-40 max-w-full p-4 sm:w-48" pinned>
        <div className="space-y-2" aria-hidden="true">
          <div className="h-2 w-2/3 rounded-full bg-ink/15" />
          <div className="h-2 w-full rounded-full bg-ink/10" />
          <div className="h-2 w-5/6 rounded-full bg-ink/10" />
          <div className="mt-3 h-14 rounded-sm bg-ink/8" />
        </div>
      </Notice>
      <div className="max-w-md space-y-2">
        <h3 className="text-xl">{title}</h3>
        <p className="text-sm text-paper-3">{body}</p>
      </div>
      {action}
    </div>
  );
}

export function SectionHead({
  eyebrow,
  title,
  lead,
  action,
}: {
  eyebrow: string;
  title: string;
  lead?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:mb-10 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        <p className="eyebrow mb-3 text-marigold">{eyebrow}</p>
        <h2 className="text-section">{title}</h2>
        {lead && <p className="mt-3 text-sm text-paper-3 sm:text-base">{lead}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8', className)}>{children}</div>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-md bg-ink-3', className)} />;
}
