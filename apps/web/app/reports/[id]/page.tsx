'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiGet, apiPost, apiDelete, apiPatch, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import {
  Container,
  SectionHead,
  Button,
  ButtonLink,
  Badge,
  Alert,
  Field,
  Input,
  Textarea,
  Select,
  Skeleton,
  EmptyState,
  cx,
} from '../../components/ui';
import type { ReportDetail } from '@findbd/shared';
import {
  CATEGORIES,
  CATEGORY_LABELS,
  DISTRICT_NAMES,
  REPORT_STATUS_TRANSITIONS,
} from '@findbd/shared';
import { formatWhen, timeAgo, publicPlace } from '../../lib/format';

export default function ReportDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { user, ready } = useAuth();
  const [report, setReport] = useState<ReportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, unknown>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [savingStatus, setSavingStatus] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiGet<{ report: ReportDetail }>(`/api/reports/${id}`)
      .then((data) => {
        if (cancelled) return;
        setReport(data.report);
        setSaved(data.report.isSaved);
        setEditForm({
          itemName: data.report.itemName,
          category: data.report.category,
          brand: data.report.brand,
          model: data.report.model,
          colour: data.report.colour,
          description: data.report.description,
          occurredAt: data.report.occurredAt.slice(0, 10),
          approxTime: data.report.approxTime,
          district: data.report.district,
          area: data.report.area,
          locationDescription: data.report.locationDescription ?? '',
          reward: data.report.reward ?? '',
          additionalDetails: data.report.additionalDetails ?? '',
        });
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError) setError(err.message);
        else setError('Failed to load report.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [id]);

  const toggleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      if (saved) {
        await apiDelete(`/api/reports/${id}/save`);
      } else {
        await apiPost(`/api/reports/${id}/save`);
      }
      setSaved((s) => !s);
    } catch {
      // swallow
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (newStatus: string) => {
    if (!report?.isOwner) return;
    setSavingStatus(true);
    setFormError(null);
    try {
      const data = await apiPost<{ report: ReportDetail }>(`/api/reports/${id}/status`, { status: newStatus });
      setReport(data.report);
    } catch (err) {
      if (err instanceof ApiError) setFormError(err.message);
      else setFormError('Failed to update status.');
    } finally {
      setSavingStatus(false);
    }
  };

  const submitUpdate = async () => {
    if (!report?.isOwner) return;
    setSavingStatus(true);
    setFormError(null);
    try {
      const body = {
        itemName: String(editForm.itemName || ''),
        category: String(editForm.category || ''),
        brand: String(editForm.brand ?? ''),
        model: String(editForm.model ?? ''),
        colour: String(editForm.colour ?? ''),
        description: String(editForm.description || ''),
        occurredAt: String(editForm.occurredAt || ''),
        approxTime: String(editForm.approxTime ?? ''),
        district: String(editForm.district || ''),
        area: String(editForm.area || ''),
        locationDescription: String(editForm.locationDescription ?? ''),
        reward: String(editForm.reward ?? ''),
        additionalDetails: String(editForm.additionalDetails ?? ''),
      };
      const data = await apiPatch<{ report: ReportDetail }>(`/api/reports/${id}`, body);
      setReport(data.report);
      setEditing(false);
    } catch (err) {
      if (err instanceof ApiError) setFormError(err.message);
      else setFormError('Failed to update report.');
    } finally {
      setSavingStatus(false);
    }
  };

  if (!ready) return <Container className="py-14"><div className="skeleton h-8 w-48"></div></Container>;
  if (loading) return <Container className="py-14"><div className="skeleton mb-4 h-6 w-32"></div><div className="skeleton h-64 w-full"></div></Container>;
  if (error || !report) return <Container className="py-14"><Alert tone="error">{error || 'Report not found.'}</Alert></Container>;

  const isOwner = report.isOwner;
  const isLost = report.type === 'lost';
  const tone = isLost ? 'lost' : 'found';

  return (
    <Container className="py-10 sm:py-14">
      <div className="max-w-3xl">
        <div className="notice overflow-hidden">
          {/* Header */}
          <div className={cx('h-1.5 w-full', isLost ? 'bg-rose' : 'bg-emerald')} />
          <div className="p-5 sm:p-7">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={tone}>{isLost ? 'Lost' : 'Found'}</Badge>
              <Badge>{CATEGORY_LABELS[report.category as keyof typeof CATEGORY_LABELS] || report.category}</Badge>
              <Badge tone="neutral">{report.statusLabel}</Badge>
              {report.matchCount > 0 && <Badge tone="found">{report.matchCount} match{report.matchCount === 1 ? '' : 'es'}</Badge>}
            </div>

            <h1 className="mt-4 text-section font-extrabold text-ink">{report.itemName}</h1>

            <dl className="mt-4 grid gap-3 font-mono text-sm text-ink/65 sm:grid-cols-2">
              <div>
                <dt className="eyebrow text-ink/45">Place</dt>
                <dd>{publicPlace(report)}</dd>
              </div>
              <div>
                <dt className="eyebrow text-ink/45">When</dt>
                <dd>{formatWhen(report.occurredAt, report.approxTime)}</dd>
              </div>
              {report.reward && (
                <div>
                  <dt className="eyebrow text-ink/45">Reward</dt>
                  <dd>{report.reward}</dd>
                </div>
              )}
              <div>
                <dt className="eyebrow text-ink/45">Filed</dt>
                <dd>{timeAgo(report.createdAt)}</dd>
              </div>
            </dl>

            <div className="mt-5">
              <h2 className="eyebrow text-ink/55 mb-1">Description</h2>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink/80">{report.description}</p>
            </div>

            {report.brand || report.model || report.colour ? (
              <div className="mt-5">
                <h2 className="eyebrow text-ink/55 mb-1">Details</h2>
                <p className="text-sm text-ink/70">
                  {[report.brand, report.model, report.colour].filter(Boolean).join(' · ')}
                </p>
              </div>
            ) : null}

            {isOwner && report.locationDescription && (
              <div className="mt-5 rounded-sm border border-rose/30 bg-rose/5 p-4">
                <h2 className="eyebrow text-rose mb-1">Your private location note</h2>
                <p className="text-sm text-ink/80">{report.locationDescription}</p>
              </div>
            )}

            {isOwner && report.additionalDetails && (
              <div className="mt-5 rounded-sm border border-ink-4 bg-ink-3/40 p-4">
                <h2 className="eyebrow text-ink/55 mb-1">Additional details (finder only)</h2>
                <p className="text-sm text-ink/80">{report.additionalDetails}</p>
              </div>
            )}

            {isOwner && report.privateIdentifiers && report.privateIdentifiers.length > 0 && (
              <div className="mt-5 rounded-sm border border-ink-4 bg-ink-3/40 p-4">
                <h2 className="eyebrow text-ink/55 mb-2">Ownership questions</h2>
                <ul className="space-y-2">
                  {report.privateIdentifiers.map((pi, idx) => (
                    <li key={idx} className="text-sm">
                      <span className="font-semibold text-ink">{pi.question}</span>
                      <br />
                      <span className="text-ink/60">{pi.answer}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Actions */}
            <div className="mt-7 flex flex-wrap gap-2">
              {user && (
                <Button variant="outline" onClick={toggleSave} disabled={saving}>
                  {saved ? 'Unwatch' : 'Watch'}
                </Button>
              )}
              {isOwner && !editing && (
                <>
                  <Button variant="outline" onClick={() => setEditing(true)}>Edit</Button>
                  {(report.status === 'active' || report.status === 'matched') && (
                    <Button variant="found" onClick={() => updateStatus('resolved')} disabled={savingStatus}>
                      Mark resolved
                    </Button>
                  )}
                  {report.status !== 'closed' && (
                    <Button variant="ghost" onClick={() => updateStatus('closed')} disabled={savingStatus}>
                      Close
                    </Button>
                  )}
                </>
              )}
            </div>

            {formError && <Alert tone="error" className="mt-4">{formError}</Alert>}
          </div>
        </div>

        {/* Edit form */}
        {editing && isOwner && (
          <div className="notice mt-6 p-5 sm:p-7 animate-rise">
            <SectionHead eyebrow="Edit" title="Update report" />
            <form
              className="mt-4 space-y-5"
              onSubmit={(e) => { e.preventDefault(); submitUpdate(); }}
            >
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Item name" htmlFor="edit-itemName">
                  <Input id="edit-itemName" value={String(editForm.itemName || '')} onChange={(e) => setEditForm({ ...editForm, itemName: e.target.value })} />
                </Field>
                <Field label="Category" htmlFor="edit-category">
                  <Select id="edit-category" value={String(editForm.category || '')} onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                  </Select>
                </Field>
                <Field label="Brand" htmlFor="edit-brand">
                  <Input id="edit-brand" value={String(editForm.brand ?? '')} onChange={(e) => setEditForm({ ...editForm, brand: e.target.value })} />
                </Field>
                <Field label="Model" htmlFor="edit-model">
                  <Input id="edit-model" value={String(editForm.model ?? '')} onChange={(e) => setEditForm({ ...editForm, model: e.target.value })} />
                </Field>
                <Field label="Colour" htmlFor="edit-colour">
                  <Input id="edit-colour" value={String(editForm.colour ?? '')} onChange={(e) => setEditForm({ ...editForm, colour: e.target.value })} />
                </Field>
                <Field label="Date occurred" htmlFor="edit-occurredAt">
                  <Input id="edit-occurredAt" type="date" value={String(editForm.occurredAt || '')} onChange={(e) => setEditForm({ ...editForm, occurredAt: e.target.value })} />
                </Field>
                <Field label="Approximate time" htmlFor="edit-approxTime">
                  <Input id="edit-approxTime" value={String(editForm.approxTime ?? '')} onChange={(e) => setEditForm({ ...editForm, approxTime: e.target.value })} placeholder="HH:MM or leave empty" />
                </Field>
                <Field label="District" htmlFor="edit-district">
                  <Select id="edit-district" value={String(editForm.district || '')} onChange={(e) => setEditForm({ ...editForm, district: e.target.value })}>
                    <option value="">Select district</option>
                    {DISTRICT_NAMES.map((d) => <option key={d} value={d}>{d}</option>)}
                  </Select>
                </Field>
                <Field label="Area" htmlFor="edit-area">
                  <Input id="edit-area" value={String(editForm.area || '')} onChange={(e) => setEditForm({ ...editForm, area: e.target.value })} />
                </Field>
              </div>
              <Field label="Description" htmlFor="edit-description">
                <Textarea id="edit-description" value={String(editForm.description || '')} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
              </Field>
              {isLost && (
                <Field label="Location description (private)" htmlFor="edit-locationDescription">
                  <Textarea id="edit-locationDescription" value={String(editForm.locationDescription ?? '')} onChange={(e) => setEditForm({ ...editForm, locationDescription: e.target.value })} />
                </Field>
              )}
              {isLost && (
                <Field label="Reward" htmlFor="edit-reward">
                  <Input id="edit-reward" value={String(editForm.reward ?? '')} onChange={(e) => setEditForm({ ...editForm, reward: e.target.value })} />
                </Field>
              )}
              {!isLost && (
                <Field label="Additional details (private)" htmlFor="edit-additionalDetails">
                  <Textarea id="edit-additionalDetails" value={String(editForm.additionalDetails ?? '')} onChange={(e) => setEditForm({ ...editForm, additionalDetails: e.target.value })} />
                </Field>
              )}
              <div className="flex gap-3">
                <Button type="submit" variant="primary" disabled={savingStatus}>
                  {savingStatus ? 'Saving…' : 'Save changes'}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
              </div>
            </form>
          </div>
        )}
      </div>
    </Container>
  );
}
