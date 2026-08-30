'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiGet, apiPost, apiDelete, ApiError } from '../../lib/api';
import { useAction } from '../../lib/hooks';
import { useRequireAuth } from '../../lib/auth';
import {
  Container,
  SectionHead,
  Button,
  ButtonLink,
  Badge,
  Alert,
  Skeleton,
  EmptyState,
  cx,
} from '../../components/ui';
import type { NotificationItem } from '@findbd/shared';
import { formatWhen, timeAgo } from '../../lib/format';

export default function NotificationsPage() {
  const user = useRequireAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    apiGet<{ notifications: NotificationItem[]; unreadCount: number; total: number }>('/api/notifications?limit=50')
      .then((data) => {
        setNotifications(data.notifications);
        setUnreadCount(data.unreadCount);
        setTotal(data.total);
      })
      .catch((err) => {
        if (err instanceof ApiError) setError(err.message);
        else setError('Failed to load notifications.');
      })
      .finally(() => setLoading(false));
  }, [user]);

  const markRead = async (id?: string) => {
    try {
      await apiPost('/api/notifications/read', id ? { ids: [id] } : {});
      setNotifications((prev) =>
        prev.map((n) => (id ? n.id === id ? { ...n, read: true } : n : { ...n, read: true })),
      );
      setUnreadCount((prev) => Math.max(0, prev - (id ? 1 : prev)));
    } catch {
      // swallow
    }
  };

  const remove = async (id: string) => {
    try {
      await apiDelete(`/api/notifications/${id}`);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      setTotal((prev) => prev - 1);
    } catch {
      // swallow
    }
  };

  if (!user) return null;

  return (
    <Container className="py-10 sm:py-14">
      <SectionHead
        eyebrow="Notifications"
        title="Your notifications"
        lead={unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
        action={
          unreadCount > 0 ? (
            <Button variant="outline" onClick={() => markRead()}>Mark all read</Button>
          ) : null
        }
      />

      {error && <Alert tone="error" className="mb-6">{error}</Alert>}

      {loading ? (
        <div className="notice divide-y divide-ink-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="p-4"><div className="skeleton mb-2 h-4 w-2/3" /><div className="skeleton h-3 w-1/3" /></div>
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <EmptyState
          title="No notifications"
          body="When a match is found, it will appear here."
        />
      ) : (
        <div className="notice divide-y divide-ink-3">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={cx(
                'flex items-start gap-4 p-4 transition-colors',
                !n.read && 'bg-ink-3/30',
              )}
            >
              <div className="flex-1 min-w-0">
                <p className={cx('text-sm font-semibold', !n.read ? 'text-paper' : 'text-paper/80')}>
                  {n.title}
                </p>
                <p className="mt-0.5 text-xs text-paper-3">{n.body}</p>
                <div className="mt-1 flex items-center gap-3">
                  <span className="text-[0.6875rem] text-paper-3">{timeAgo(n.createdAt)}</span>
                  {n.link && (
                    <Link href={n.link} className="text-[0.6875rem] font-semibold text-marigold hover:underline">
                      Open
                    </Link>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                {!n.read && (
                  <Button variant="ghost" className="min-h-9 px-2 text-xs" onClick={() => markRead(n.id)}>
                    Read
                  </Button>
                )}
                <Button variant="ghost" className="min-h-9 px-2 text-xs text-rose" onClick={() => remove(n.id)}>
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Container>
  );
}
