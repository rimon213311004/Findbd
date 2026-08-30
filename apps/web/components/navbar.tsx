'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../lib/auth';
import { apiGet } from '../lib/api';
import { Button, ButtonLink, Container, cx } from './ui';

/**
 * The navbar.
 *
 * Two things it deliberately does not do. It does not render a signed-out state
 * while the session restore is still in flight — that flash of "Sign in" for a
 * signed-in user is the single most common tell of a client-side auth app. And
 * the mobile menu is a real drawer, not a squeezed row: a five-item nav at 360px
 * either wraps into something unreadable or scrolls sideways, and both are worse
 * than a tap.
 */

const LINKS = [
  { href: '/reports', label: 'Browse reports', auth: false },
  { href: '/dashboard', label: 'Dashboard', auth: true },
  { href: '/dashboard/matches', label: 'Matches', auth: true },
] as const;

export function Navbar() {
  const { user, ready, signOut } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  // Close the drawer on navigation; leaving it open over the new page is jarring.
  useEffect(() => setOpen(false), [pathname]);

  // Lock the page behind the drawer so the body does not scroll under it.
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  /**
   * Poll the unread count. Phase 5 replaces this with a socket; until then a
   * one-minute poll of a single indexed count is the honest trade — the bell has
   * to be right within a minute, and 60 requests an hour per signed-in user is
   * cheaper than the infrastructure to avoid them.
   */
  useEffect(() => {
    if (!user) {
      setUnread(0);
      return;
    }
    let alive = true;
    const read = async () => {
      try {
        const { unreadCount } = await apiGet<{ unreadCount: number }>(
          '/api/notifications/unread-count',
        );
        if (alive) setUnread(unreadCount);
      } catch {
        // A failed count is not worth telling anyone about.
      }
    };
    read();
    const timer = setInterval(read, 60_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [user, pathname]);

  const links = LINKS.filter((link) => !link.auth || user);

  return (
    <header className="sticky top-0 z-50 border-b border-ink-3 bg-ink/92 backdrop-blur-md">
      <Container className="flex h-16 items-center gap-4">
        <Link href="/" className="flex items-center gap-2.5" aria-label="FindBD home">
          <span
            aria-hidden="true"
            className="grid size-8 place-items-center rounded-sm bg-marigold font-display text-lg font-extrabold leading-none text-ink"
          >
            ফ
          </span>
          <span className="font-display text-xl font-extrabold tracking-tight">FindBD</span>
        </Link>

        <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="Main">
          {links.map((link) => (
            <NavLink key={link.href} href={link.href} active={isActive(pathname, link.href)}>
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {user && (
            <Link
              href="/notifications"
              className="relative grid size-11 place-items-center rounded-sm text-paper-3 transition-colors hover:text-marigold"
              aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
            >
              <BellIcon />
              {unread > 0 && (
                <span className="absolute right-1.5 top-1.5 grid min-w-4 place-items-center rounded-full bg-rose px-1 font-mono text-[0.625rem] font-bold leading-4 text-white">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </Link>
          )}

          {/* Nothing renders here until the restore settles — see the note above. */}
          {ready &&
            (user ? (
              <div className="hidden items-center gap-2 md:flex">
                <ButtonLink href="/report/lost" variant="lost">
                  Report lost
                </ButtonLink>
                <ButtonLink href="/report/found" variant="found">
                  Report found
                </ButtonLink>
                <Button variant="ghost" onClick={() => void signOut()}>
                  Sign out
                </Button>
              </div>
            ) : (
              <div className="hidden items-center gap-2 md:flex">
                <ButtonLink href="/login" variant="outline">
                  Sign in
                </ButtonLink>
                <ButtonLink href="/register" variant="primary">
                  Create account
                </ButtonLink>
              </div>
            ))}

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="grid size-11 place-items-center rounded-sm text-paper md:hidden"
            aria-expanded={open}
            aria-label={open ? 'Close menu' : 'Open menu'}
          >
            {open ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </Container>

      {open && (
        <div className="animate-rise border-t border-ink-3 bg-ink md:hidden">
          <Container className="flex flex-col gap-1 py-4">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cx(
                  'flex min-h-12 items-center rounded-sm px-3 text-[0.9375rem] font-semibold',
                  isActive(pathname, link.href) ? 'bg-ink-2 text-marigold' : 'text-paper',
                )}
              >
                {link.label}
              </Link>
            ))}

            <div className="mt-3 flex flex-col gap-2 border-t border-ink-3 pt-4">
              {user ? (
                <>
                  <ButtonLink href="/report/lost" variant="lost">
                    Report a lost item
                  </ButtonLink>
                  <ButtonLink href="/report/found" variant="found">
                    Report a found item
                  </ButtonLink>
                  <Button variant="outline" onClick={() => void signOut()}>
                    Sign out
                  </Button>
                </>
              ) : (
                <>
                  <ButtonLink href="/register" variant="primary">
                    Create account
                  </ButtonLink>
                  <ButtonLink href="/login" variant="outline">
                    Sign in
                  </ButtonLink>
                </>
              )}
            </div>
          </Container>
        </div>
      )}
    </header>
  );
}

function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cx(
        'relative flex min-h-11 items-center rounded-sm px-3 text-sm font-semibold transition-colors',
        active ? 'text-marigold' : 'text-paper-3 hover:text-paper',
      )}
    >
      {children}
      {active && (
        <span aria-hidden="true" className="absolute inset-x-3 bottom-2 h-px bg-marigold" />
      )}
    </Link>
  );
}

/* Inline SVGs: three icons is not worth a dependency. */

function BellIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" strokeLinecap="round" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
    </svg>
  );
}
