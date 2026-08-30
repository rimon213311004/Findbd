'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../lib/auth';
import { useAction } from '../../lib/hooks';
import { ApiError } from '../../lib/api';
import { Container, Field, Input, Button, Alert, EmptyState, ButtonLink, cx } from '../../components/ui';
import type { LoginInput } from '@findbd/shared';

export default function LoginPage() {
  const router = useRouter();
  const { ready, user, signIn } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);

  const action = useAction<[LoginInput], void>(
    async (input) => {
      setFormError(null);
      await signIn(input);
    },
  );

  useEffect(() => {
    if (ready && user) {
      const next = new URLSearchParams(window.location.search).get('next');
      router.replace(next || '/dashboard');
    }
  }, [ready, user, router]);

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
          <p className="eyebrow text-marigold mb-2">Welcome back</p>
          <h1 className="text-section font-extrabold text-ink">Sign in</h1>
          <p className="mt-2 text-sm text-ink/60">
            Sign in to manage your reports and matches.
          </p>

          {formError && (
            <Alert tone="error" className="mt-5">
              {formError}
            </Alert>
          )}

          <form
            className="mt-6 space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const input: LoginInput = {
                email: String(fd.get('email') ?? ''),
                password: String(fd.get('password') ?? ''),
              };
              action.run(input).catch((err: unknown) => {
                if (err instanceof ApiError) {
                  if (err.code === 'INVALID_CREDENTIALS') {
                    setFormError('Invalid email or password.');
                  } else {
                    setFormError(err.message);
                  }
                } else {
                  setFormError('Something went wrong. Please try again.');
                }
              });
            }}
          >
            <Field label="Email" htmlFor="email" required error={action.fieldErrors.email}>
              <Input id="email" name="email" type="email" autoComplete="email" invalid={!!action.fieldErrors.email} />
            </Field>

            <Field label="Password" htmlFor="password" required error={action.fieldErrors.password}>
              <Input id="password" name="password" type="password" autoComplete="current-password" invalid={!!action.fieldErrors.password} />
            </Field>

            <Button type="submit" variant="primary" className="w-full min-h-12" disabled={action.pending}>
              {action.pending ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-ink/55">
            Don&apos;t have an account?{' '}
            <Link href="/register" className="font-semibold text-marigold underline underline-offset-2">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </Container>
  );
}
