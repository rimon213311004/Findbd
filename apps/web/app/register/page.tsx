'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../lib/auth';
import { useAction } from '../../lib/hooks';
import { apiPost, ApiError } from '../../lib/api';
import { Container, Field, Input, Button, Alert, EmptyState, ButtonLink, cx } from '../../components/ui';
import type { RegisterInput } from '@findbd/shared';

export default function RegisterPage() {
  const router = useRouter();
  const { ready, user } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);

  const action = useAction<[RegisterInput], { user: unknown; accessToken: string }>(
    async (input) => {
      setFormError(null);
      const data = await apiPost<{ user: unknown; accessToken: string }>('/api/auth/register', input);
      return data;
    },
  );

  useEffect(() => {
    if (ready && action.pending === false && !action.error && user) {
      router.replace('/dashboard');
    }
  }, [ready, action.pending, action.error, user, router]);

  if (ready && user) {
    return (
      <Container className="py-20">
        <EmptyState
          title="Already signed in"
          body="You are logged in. Redirecting to your dashboard…"
          action={
            <ButtonLink href="/dashboard" variant="primary">
              Go to dashboard
            </ButtonLink>
          }
        />
      </Container>
    );
  }

  return (
    <Container className="py-12 sm:py-20">
      <div className="mx-auto max-w-md">
        <div className="notice p-6 sm:p-8">
          <p className="eyebrow text-marigold mb-2">Get started</p>
          <h1 className="text-section font-extrabold text-ink">Create an account</h1>
          <p className="mt-2 text-sm text-ink/60">
            One account for all your reports and matches.
          </p>

          {formError && (
            <div className="mt-5 rounded-sm border border-rose/45 bg-rose/10 px-4 py-3 text-sm text-[#ffc2cd]" role="alert">
              {formError}
            </div>
          )}

          <form
            className="mt-6 space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const input: RegisterInput = {
                fullName: String(fd.get('fullName') ?? ''),
                email: String(fd.get('email') ?? ''),
                password: String(fd.get('password') ?? ''),
                confirmPassword: String(fd.get('confirmPassword') ?? ''),
              };
              action.run(input).catch((err: unknown) => {
                if (err instanceof ApiError) {
                  setFormError(err.message);
                } else {
                  setFormError('Something went wrong. Please try again.');
                }
              });
            }}
          >
            <Field label="Full name" htmlFor="fullName" required error={action.fieldErrors.fullName}>
              <Input id="fullName" name="fullName" autoComplete="name" invalid={!!action.fieldErrors.fullName} />
            </Field>

            <Field label="Email" htmlFor="email" required error={action.fieldErrors.email}>
              <Input id="email" name="email" type="email" autoComplete="email" invalid={!!action.fieldErrors.email} />
            </Field>

            <Field label="Password" htmlFor="password" required error={action.fieldErrors.password || action.fieldErrors.confirmPassword}>
              <Input id="password" name="password" type="password" autoComplete="new-password" invalid={!!action.fieldErrors.password || !!action.fieldErrors.confirmPassword} />
              <p className="text-[0.6875rem] text-ink/50">At least 10 characters with a letter and a number.</p>
            </Field>

            <Field label="Confirm password" htmlFor="confirmPassword" required error={action.fieldErrors.confirmPassword}>
              <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" invalid={!!action.fieldErrors.confirmPassword} />
            </Field>

            <Button type="submit" variant="primary" className="w-full min-h-12" disabled={action.pending}>
              {action.pending ? 'Creating account…' : 'Create account'}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-ink/55">
            Already have an account?{' '}
            <Link href="/login" className="font-semibold text-marigold underline underline-offset-2">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </Container>
  );
}
