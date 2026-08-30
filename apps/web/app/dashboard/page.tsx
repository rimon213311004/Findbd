'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiGet, apiDelete, ApiError } from '../../lib/api';
import { useAction } from '../../lib/hooks';
import { useRequireAuth } from '../../lib/auth';
import {
  Container,
  SectionHead,
  Button,
  Badge,
  Alert,
  Skeleton,
  EmptyState,
  cx,
} from '../../components/ui';
import { ReportRow } from '../../components/report-card';
import type { ReportSummary } from '@findbd/shared';
import { formatWhen } from '../../lib/format';

export default function DashboardPage() {
  const user = useRequireAuth();
  const router = useRouter();
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<{ total: number; active: number; matched: number } | null>(null);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      apiGet<{ reports: ReportSummary[] }>('/api/reports/mine?limit=20'),
      apiGet<{ stats: { total: number; active: number; matched: number } }>('/api/reports/stats'),
    ])
      .then(([reportsRes, statsRes]) => {
        setReports(reportsRes.reports);
        setStats(statsRes.stats);
      })
      .catch((err) => {
        if (err instanceof ApiError) setError(err.message);
        else setError('Failed to load dashboard.');
      })
      .finally(() => setLoading(false));
  }, [user]);

  const deleteReport = async (id: string) => {
    if (!confirm('Delete this report? This cannot be undone.')) return;
    try {
      await apiDelete(`/api/reports/${id}`);
      setReports((prev) => prev.filter((r) => r.id !== id));
      setStats((prev) => prev ? { ...prev, total: prev.total - 1 } : prev);
    } catch {
      // swallow
    }
  };

  if (!user) return null;

  return (
    <Container className="py-10 sm:py-14">
      <SectionHead
        eyebrow="Dashboard"
        title="Your reports"
        lead="Manage your lost and found items."
        action={
          <div className="flex gap-2">
            <Link href="/report/lost"><Button variant="lost">Report lost</Button></Link>
            <Link href="/report/found"><Button variant="found">Report found</Button></Link>
          </div>
        }
      />

      {error && <Alert tone="error" className="mb-6">{error}</Alert>}

      {stats && (
        <div className="mb-8 grid grid-cols-3 gap-3 sm:gap-4">
          {[
            { label: 'Total', value: stats.total },
            { label: 'Active', value: stats.active },
            { label: 'Matched', value: stats.matched },
          ].map((s) => (
            <div key={s.label} className="notice p-4 text-center">
              <p className="text-2xl font-extrabold text-ink">{s.value}</p>
              <p className="eyebrow text-ink/55 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="notice divide-y divide-ink-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="p-4"><div className="skeleton mb-2 h-4 w-2/3" /><div className="skeleton h-3 w-1/3" /></div>
          ))}
        </div>
      ) : reports.length === 0 ? (
        <EmptyState
          title="No reports yet"
          body="File a lost or found item to see it here."
          action={
            <div className="flex gap-2">
              <Link href="/report/lost"><Button variant="lost">Report lost</Button></Link>
              <Link href="/report/found"><Button variant="found">Report found</Button></Link>
            </div>
          }
        />
      ) : (
        <div className="notice divide-y divide-ink-3">
          {reports.map((report) => (
            <div key={report.id} className="group relative">
              <ReportRow report={report} />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100">
                <Button variant="ghost" className="min-h-9 px-2 text-xs" onClick={() => deleteReport(report.id)}>
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
