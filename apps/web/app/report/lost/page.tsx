'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../lib/auth';
import { apiPost, ApiError } from '../../lib/api';
import {
  Container,
  SectionHead,
  Field,
  Input,
  Textarea,
  Select,
  Button,
  ButtonLink,
  Alert,
  Badge,
  cx,
} from '../../components/ui';
import {
  CATEGORIES,
  CATEGORY_LABELS,
  DISTRICT_NAMES,
  type CreateLostReportInput,
} from '@findbd/shared';

export default function ReportLostPage() {
  const router = useRouter();
  const { ready } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [itemName, setItemName] = useState('');
  const [category, setCategory] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [colour, setColour] = useState('');
  const [description, setDescription] = useState('');
  const [occurredAt, setOccurredAt] = useState('');
  const [approxTime, setApproxTime] = useState('');
  const [district, setDistrict] = useState('');
  const [area, setArea] = useState('');
  const [locationDescription, setLocationDescription] = useState('');
  const [reward, setReward] = useState('');

  if (!ready) return <Container className="py-14"><div className="skeleton h-8 w-48"></div></Container>;

  const submit = async () => {
    setFormError(null);
    setSubmitting(true);
    try {
      const body: CreateLostReportInput = {
        type: 'lost',
        itemName,
        category: category as CreateLostReportInput['category'],
        brand,
        model,
        colour,
        description,
        occurredAt: new Date(occurredAt),
        approxTime: approxTime || undefined,
        district,
        area,
        locationDescription,
        reward,
        privateIdentifiers: [],
      };
      const data = await apiPost<{ report: { id: string } }>('/api/reports', body);
      setSuccess('Report filed successfully.');
      setTimeout(() => router.push(`/reports/${data.report.id}`), 800);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.fieldErrors.length > 0) {
          setFormError(err.fieldErrors.map((f) => `${f.path}: ${f.message}`).join(', '));
        } else {
          setFormError(err.message);
        }
      } else {
        setFormError('Something went wrong.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Container className="py-10 sm:py-14">
      <div className="mx-auto max-w-2xl">
        <SectionHead
          eyebrow="Report lost"
          title="What did you lose?"
          lead="Fill in everything you remember. The more detail, the better the match."
        />

        {success && <Alert tone="info" className="mb-5">Report filed! Redirecting…</Alert>}
        {formError && <Alert tone="error" className="mb-5">{formError}</Alert>}

        <form className="notice p-5 sm:p-7" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Item name" htmlFor="itemName" required>
              <Input id="itemName" value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="e.g. Samsung Galaxy S23" />
            </Field>
            <Field label="Category" htmlFor="category" required>
              <Select id="category" value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">Choose a category</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
              </Select>
            </Field>
            <Field label="Brand" htmlFor="brand">
              <Input id="brand" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Samsung" />
            </Field>
            <Field label="Model" htmlFor="model">
              <Input id="model" value={model} onChange={(e) => setModel(e.target.value)} placeholder="Galaxy S23" />
            </Field>
            <Field label="Colour" htmlFor="colour">
              <Input id="colour" value={colour} onChange={(e) => setColour(e.target.value)} placeholder="Black" />
            </Field>
            <Field label="Date lost" htmlFor="occurredAt" required>
              <Input id="occurredAt" type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
            </Field>
            <Field label="Approximate time (optional)" htmlFor="approxTime">
              <Input id="approxTime" value={approxTime} onChange={(e) => setApproxTime(e.target.value)} placeholder="14:30" />
            </Field>
            <Field label="District" htmlFor="district" required>
              <Select id="district" value={district} onChange={(e) => setDistrict(e.target.value)}>
                <option value="">Choose district</option>
                {DISTRICT_NAMES.map((d) => <option key={d} value={d}>{d}</option>)}
              </Select>
            </Field>
            <Field label="Area" htmlFor="area" required>
              <Input id="area" value={area} onChange={(e) => setArea(e.target.value)} placeholder="e.g. Mirpur 10" />
            </Field>
          </div>

          <Field label="Description" htmlFor="description" required className="mt-5">
            <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the item and any distinguishing features…" />
          </Field>

          <Field label="Reward (optional)" htmlFor="reward" className="mt-5">
            <Input id="reward" value={reward} onChange={(e) => setReward(e.target.value)} placeholder="e.g. ৫০০০ টাকা" />
          </Field>

          <Field label="Location description (private — only you can see this)" htmlFor="locationDescription" className="mt-5">
            <Textarea id="locationDescription" value={locationDescription} onChange={(e) => setLocationDescription(e.target.value)} placeholder="Exact spot, landmark, floor, shop name…" />
          </Field>

          <div className="mt-6 flex gap-3">
            <Button type="submit" variant="lost" className="min-h-12" disabled={submitting}>
              {submitting ? 'Filing…' : 'File lost report'}
            </Button>
            <ButtonLink href="/reports" variant="ghost">Cancel</ButtonLink>
          </div>
        </form>
      </div>
    </Container>
  );
}
