'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { apiGet, qs } from '../lib/api';
import { ReportCard } from '../components/report-card';
import { MatchLedger } from '../components/match-ledger';
import { Container, SectionHead, EmptyState, Badge, Button, ButtonLink, cx } from '../components/ui';
import type { ReportSummary, ScoreComponent, MatchTier } from '@findbd/shared';
import { MATCH_TIER_MINIMUM } from '@findbd/shared';

export default function HomePage() {
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<{ reports: ReportSummary[] }>(`/api/reports?${qs({ sort: 'newest', limit: 8 })}`)
      .then((data) => setReports(data.reports))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-ink-3">
        <div className="absolute inset-0 bg-gradient-to-b from-marigold/[0.07] to-transparent" aria-hidden="true" />
        <Container className="relative py-16 sm:py-24">
          <div className="max-w-2xl">
            <p className="eyebrow text-marigold mb-4">Lost & Found in Bangladesh</p>
            <h1 className="text-hero font-extrabold leading-[1.05] tracking-tight">
              Find it,<br />
              <span className="text-marigold">or find it again.</span>
            </h1>
            <p className="mt-6 text-base leading-relaxed text-paper-3 sm:text-lg">
              The smart matching engine pairs lost items with found ones automatically.
              File a report in two minutes and get notified when a match scores.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/reports" variant="lost" className="min-h-12 px-6 text-base">
                Browse reports
              </ButtonLink>
              <ButtonLink href="/report/lost" variant="primary" className="min-h-12 px-6 text-base">
                Report a lost item
              </ButtonLink>
            </div>
          </div>
        </Container>
      </section>

      {/* How it works */}
      <section className="border-b border-ink-3 bg-ink-2/40">
        <Container className="py-14 sm:py-20">
          <SectionHead
            eyebrow="How it works"
            title="Three steps to a match"
            lead="No phone number required. Just what the item is, where, and when."
          />
          <div className="grid gap-6 sm:grid-cols-3">
            {[
              {
                step: '1',
                title: 'File a report',
                body: 'Pick lost or found, fill in the details. Exact location stays private — only area and district are shown publicly.',
              },
              {
                step: '2',
                title: 'Smart matching',
                body: 'The engine scores every pair on location, category, brand, colour, date, and description. A hard disqualifier prevents the impossible.',
              },
              {
                step: '3',
                title: 'Connect',
                body: 'You get an in-app notification when a match scores above the threshold. Open the report, see the breakdown, reach out.',
              },
            ].map((item) => (
              <div key={item.step} className="notice p-5 sm:p-6">
                <span className="eyebrow text-marigold">{`Step ${item.step}`}</span>
                <h3 className="mt-2 text-lg font-bold text-ink">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink/65">{item.body}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* Live reports */}
      <section className="border-b border-ink-3">
        <Container className="py-14 sm:py-20">
          <SectionHead
            eyebrow="On the wall"
            title="Recent reports"
            action={
              <ButtonLink href="/reports" variant="outline" className="min-h-11">
                Browse all
              </ButtonLink>
            }
          />
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
              title="No reports yet"
              body="Be the first to file a lost or found item."
              action={
                <ButtonLink href="/report/lost" variant="primary">
                  File a report
                </ButtonLink>
              }
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {reports.map((report) => (
                <ReportCard key={report.id} report={report} />
              ))}
            </div>
          )}
        </Container>
      </section>

      {/* Match ledger demo */}
      <section className="bg-ink-2/40">
        <Container className="py-14 sm:py-20">
          <SectionHead
            eyebrow="Transparent scoring"
            title="See why it matches"
            lead="Every score is broken down item by item. No black boxes."
          />
          <div className="max-w-2xl">
            <MatchLedger
              components={demoComponents}
              score={DEMO_SCORE}
              tier={DEMO_TIER}
              caption="Demo scores — real scores look the same."
              className="mx-auto"
            />
          </div>
        </Container>
      </section>

      {/* Footer */}
      <footer className="border-t border-ink-3">
        <Container className="py-8 text-center text-xs text-paper-3">
          <p>FindBD — built for Bangladesh, open to the world.</p>
          <p className="mt-1">R_04 copyright</p>
        </Container>
      </footer>
    </div>
  );
}

const DEMO_SCORE = 87.5;
const DEMO_TIER: MatchTier = 'excellent';
const tierForScore = (score: number): MatchTier | null => {
  if (score >= MATCH_TIER_MINIMUM.excellent) return 'excellent';
  if (score >= MATCH_TIER_MINIMUM.strong) return 'strong';
  if (score >= MATCH_TIER_MINIMUM.possible) return 'possible';
  return null;
};

const demoComponents: ScoreComponent[] = [
  {
    key: 'location',
    label: 'Location',
    weight: 30,
    score: 1,
    points: 30,
    rationale: 'Both report Mirpur 10, Dhaka.',
  },
  {
    key: 'category',
    label: 'Category',
    weight: 20,
    score: 1,
    points: 20,
    rationale: 'Both are Mobile Phone.',
  },
  {
    key: 'brand',
    label: 'Brand',
    weight: 15,
    score: 1,
    points: 15,
    rationale: 'Both say Samsung.',
  },
  {
    key: 'colour',
    label: 'Colour',
    weight: 10,
    score: 1,
    points: 10,
    rationale: 'Both say Black.',
  },
  {
    key: 'date',
    label: 'Date',
    weight: 10,
    score: 0.8,
    points: 8,
    rationale: 'Within 2 days of each other.',
  },
  {
    key: 'time',
    label: 'Time',
    weight: 10,
    score: 0.5,
    points: 5,
    rationale: 'One recalled 14:30, the other 15:00.',
  },
  {
    key: 'description',
    label: 'Description',
    weight: 5,
    score: 0.7,
    points: 3.5,
    rationale: 'Similar wording around screen crack and case colour.',
  },
];
