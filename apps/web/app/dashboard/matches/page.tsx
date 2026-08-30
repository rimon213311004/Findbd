'use client';

import { useEffect, useState } from 'react';
import { apiGet, apiPost, ApiError } from '../../lib/api';
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
import { MatchCard } from '../../components/match-card';
import type { MatchSummary } from '@findbd/shared';

export default function MatchesPage() {
  const user = useRequireAuth();
  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<{ new: number; notified: number; dismissed: number } | null>(null);

  useEffect(() => {
    if (!user) return;
    apiGet<{ matches: MatchSummary[] }>('/api/matches')
      .then((data) => setMatches(data.matches))
      .catch((err) => {
        if (err instanceof ApiError) setError(err.message);
        else setError('Failed to load matches.');
      })
      .finally(() => setLoading(false));

    apiGet<{ counts: { new: number; notified: number; dismissed: number } }>('/api/matches/counts')
      .then((data) => setCounts(data.counts))
      .catch(() => {});
  }, [user]);

  const markSeen = async () => {
    try {
      await apiPost('/api/matches/seen', { ids: matches.filter((m) => m.status === 'new').map((m) => m.id) });
      setMatches((prev) => prev.map((m) => m.status === 'new' ? { ...m, status: 'notified' as const } : m));
    } catch {
      // swallow
    }
  };

  const dismiss = async (id: string) => {
    try {
      const data = await apiPost<{ match: MatchSummary }>(`/api/matches/${id}/dismiss`);
      setMatches((prev) => prev.map((m) => m.id === id ? data.match : m));
    } catch {
      // swallow
    }
  };

  if (!user) return null;

  return (
    <Container className="py-10 sm:py-14">
      <SectionHead
        eyebrow="Matches"
        title="Your matches"
        lead="Pairs scored by the engine, ordered by strength."
        action={
          counts && counts.new > 0 ? (
            <Button variant="outline" onClick={markSeen}>Mark all seen</Button>
          ) : null
        }
      />

      {error && <Alert tone="error" className="mb-6">{error}</Alert>}

      {counts && (
        <div className="mb-6 flex gap-3">
          <Badge tone="lost">{counts.new} new</Badge>
          <Badge tone="neutral">{counts.notified} notified</Badge>
          <Badge tone="neutral">{counts.dismissed} dismissed</Badge>
        </div>
      )}

      {loading ? (
        <div className="grid gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="notice p-5">
              <div className="skeleton mb-3 h-4 w-1/4" />
              <div className="skeleton mb-2 h-3 w-full" />
              <div className="skeleton h-3 w-2/3" />
            </div>
          ))}
        </div>
      ) : matches.length === 0 ? (
        <EmptyState
          title="No matches yet"
          body="Matches appear automatically when a lost and found report score above the threshold."
          action={
            <ButtonLink href="/reports" variant="primary">
              Browse reports
            </ButtonLink>
          }
        />
      ) : (
        <div className="grid gap-4">
          {matches.map((match) => (
            <MatchCard key={match.id} match={match} onDismiss={dismiss} dismissing={false} />
          ))}
        </div>
      )}
    </Container>
  );
}
