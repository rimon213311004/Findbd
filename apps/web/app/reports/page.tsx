'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiGet, apiPost, apiDelete, ApiError, qs } from '../../lib/api';
import { useRequireAuth } from '../../lib/auth';
import { ReportCard, ReportRow } from '../../components/report-card';
import {
  Container,
  SectionHead,
  Button,
  ButtonLink,
  Badge,
  Alert,
  Select,
  Field,
  Input,
  Skeleton,
  EmptyState,
  cx,
} from '../../components/ui';
import {
  ReportSummary,
  ListReportsQuery,
  ReportType,
  CATEGORIES,
  CATEGORY_LABELS,
  REPORT_TYPES,
  REPORT_SORTS,
  type ReportSort,
} from '@findbd/shared';

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'relevant', label: 'Most relevant' },
] as const;

export default function ReportsPage() {
  const searchParams = useSearchParams();
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const user = useRequireAuth();

  const [type, setType] = useState(searchParams.get('type') || '');
  const [category, setCategory] = useState(searchParams.get('category') || '');
  const [district, setDistrict] = useState(searchParams.get('district') || '');
  const [q, setQ] = useState(searchParams.get('q') || '');
  const [sort, setSort] = useState<ReportSort>(searchParams.get('sort') as ReportSort || 'newest');
  const [page, setPage] = useState(Number(searchParams.get('page') || 1));

  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const queryParams = {
        sort,
        page,
        limit: 20,
        ...(type ? { type } : {}),
        ...(category ? { category } : {}),
        ...(district ? { district } : {}),
        ...(q ? { q } : {}),
      };
      const data = await apiGet<{ reports: ReportSummary[]; meta: { page: number; limit: number; total: number; totalPages: number } }>(
        `/api/reports?${qs(queryParams)}`,
      );
      setReports(data.reports);
      setTotal(data.meta.total);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError('Failed to load reports.');
    } finally {
      setLoading(false);
    }
  }, [type, category, district, q, sort, page]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  useEffect(() => {
    if (!user) return;
    apiGet<{ reports: { id: string }[] }>(`/api/reports/saved?${qs({ page: 1, limit: 100 })}`).then((data) => {
      setSavedIds(new Set(data.reports.map((r) => r.id)));
    }).catch(() => {});
  }, [user]);

  const toggleSave = async (reportId: string) => {
    setSavingId(reportId);
    try {
      if (savedIds.has(reportId)) {
        await apiDelete(`/api/reports/${reportId}/save`);
        setSavedIds((prev) => { const next = new Set(prev); next.delete(reportId); return next; });
      } else {
        await apiPost(`/api/reports/${reportId}/save`);
        setSavedIds((prev) => new Set(prev).add(reportId));
      }
    } catch {
      // swallow
    } finally {
      setSavingId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / 20));

  return (
    <Container className="py-10 sm:py-14">
      <SectionHead
        eyebrow="Browse"
        title="Reports"
        lead="Search lost and found items filed across Bangladesh."
      />

      {error && <Alert tone="error" className="mb-6">{error}</Alert>}

      {/* Filters */}
      <div className="notice mb-8 p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Search" htmlFor="q" className="lg:col-span-2">
            <Input
              id="q"
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1); }}
              placeholder="Item name, brand, colour…"
            />
          </Field>
          <Field label="Type" htmlFor="type">
            <Select id="type" value={type} onChange={(e) => { setType(e.target.value as ReportType | ''); setPage(1); }}>
              <option value="">All types</option>
              {REPORT_TYPES.map((t) => (
                <option key={t} value={t}>{t === 'lost' ? 'Lost' : 'Found'}</option>
              ))}
            </Select>
          </Field>
          <Field label="Category" htmlFor="category">
            <Select id="category" value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}>
              <option value="">All categories</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
              ))}
            </Select>
          </Field>
          <Field label="Sort" htmlFor="sort">
            <Select id="sort" value={sort} onChange={(e) => setSort(e.target.value as ReportSort)}>
              {SORT_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {district && (
            <Badge tone="neutral" className="gap-2">
              {district}
              <button type="button" onClick={() => { setDistrict(''); setPage(1); }} className="ml-1 text-paper-3 hover:text-paper" aria-label="Clear district">
                ×
              </button>
            </Badge>
          )}
          {type && (
            <Badge tone={type === 'lost' ? 'lost' : 'found'} className="gap-2">
              {type === 'lost' ? 'Lost' : 'Found'}
              <button type="button" onClick={() => { setType(''); setPage(1); }} className="ml-1 text-paper-3 hover:text-paper" aria-label="Clear type">
                ×
              </button>
            </Badge>
          )}
          {category && (
            <Badge tone="neutral" className="gap-2">
              {CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS] || category}
              <button type="button" onClick={() => { setCategory(''); setPage(1); }} className="ml-1 text-paper-3 hover:text-paper" aria-label="Clear category">
                ×
              </button>
            </Badge>
          )}
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="notice p-4">
              <div className="skeleton mb-3 h-3 w-1/3" />
              <div className="skeleton mb-2 h-4 w-2/3" />
              <div className="skeleton h-3 w-full" />
            </div>
          ))}
        </div>
      ) : reports.length === 0 ? (
        <EmptyState
          title="No reports found"
          body="Try adjusting your filters, or file the first report."
          action={
            <ButtonLink href="/report/lost" variant="primary">
              File a report
            </ButtonLink>
          }
        />
      ) : (
        <>
          <p className="mb-4 text-xs text-paper-3">{total} report{total === 1 ? '' : 's'} found</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {reports.map((report) => (
              <div key={report.id} className="relative">
                <ReportCard report={report} />
                {user && (
                  <button
                    type="button"
                    onClick={() => toggleSave(report.id)}
                    disabled={savingId === report.id}
                    className={cx(
                      'absolute right-3 top-3 min-h-9 rounded-sm px-2.5 text-xs font-semibold',
                      savedIds.has(report.id)
                        ? 'bg-marigold text-ink'
                        : 'bg-ink/60 text-paper backdrop-blur-sm',
                    )}
                  >
                    {savingId === report.id ? '…' : savedIds.has(report.id) ? 'Watching' : 'Watch'}
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-8 flex items-center justify-between">
              <Button
                variant="outline"
                disabled={page <= 1}
                onClick={() => { setPage((p) => p - 1); }}
              >
                Previous
              </Button>
              <span className="text-sm text-paper-3">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                disabled={page >= totalPages}
                onClick={() => { setPage((p) => p + 1); }}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </Container>
  );
}
