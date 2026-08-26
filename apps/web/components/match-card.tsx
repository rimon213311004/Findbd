'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { MatchSummary } from '@findbd/shared';
import { MatchLedger } from './match-ledger';
import { Badge, Button, ButtonLink, cx } from './ui';
import { formatWhen, timeAgo } from '../lib/format';

/**
 * A match, from the viewer's side.
 *
 * `viewerSide` tells us which of the two reports is theirs, so the card can say
 * "your lost Samsung" and "their found phone" without comparing owner ids. Both
 * reports come through as summaries — being matched with someone is not consent to
 * read their private answers, in either direction.
 *
 * The ledger is collapsed by default and opens in place. Left open, three matches
 * would be a wall of twenty-one rows; the score and the two items are what you
 * scan, the arithmetic is what you check once you have decided to care.
 */

export function MatchCard({
  match,
  onDismiss,
  dismissing = false,
}: {
  match: MatchSummary;
  onDismiss?: (id: string) => void;
  dismissing?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const mine = match.viewerSide === 'found' ? match.foundReport : match.lostReport;
  const theirs = match.viewerSide === 'found' ? match.lostReport : match.foundReport;
  const theirSideLabel = match.viewerSide === 'found' ? 'Someone lost' : 'Someone found';

  const tone =
    match.tier === 'excellent' ? 'found' : match.tier === 'strong' ? 'neutral' : 'neutral';

  return (
    <article className="overflow-hidden rounded-sm border border-ink-3 bg-ink-2">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-3 px-4 py-3.5 sm:px-5">
        <div className="flex items-center gap-3">
          <p className="flex items-baseline gap-1 font-mono leading-none">
            <span className="text-2xl font-bold text-marigold">{match.score.toFixed(1)}</span>
            <span className="text-xs text-paper-3">/100</span>
          </p>
          <Badge tone={tone}>{match.tierLabel}</Badge>
          {match.status === 'new' && <Badge tone="lost">New</Badge>}
        </div>
        <p className="font-mono text-[0.6875rem] text-paper-3">
          Scored {timeAgo(match.computedAt)}
        </p>
      </header>

      {/* The pair. Yours on the left, theirs on the right — stacked on mobile with
          a connector between, so the relationship survives the reflow. */}
      <div className="grid gap-3 p-4 sm:grid-cols-[1fr_auto_1fr] sm:items-stretch sm:gap-4 sm:px-5">
        <MatchSide label="You reported" report={mine} />
        <div
          aria-hidden="true"
          className="flex items-center justify-center font-mono text-xs text-paper-3 sm:flex-col"
        >
          <span className="h-px w-8 bg-ink-4 sm:h-8 sm:w-px" />
          <span className="px-2 sm:py-2">↔</span>
          <span className="h-px w-8 bg-ink-4 sm:h-8 sm:w-px" />
        </div>
        <MatchSide label={theirSideLabel} report={theirs} highlight />
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-ink-3 px-4 py-3 sm:px-5">
        <Button
          variant="outline"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={`ledger-${match.id}`}
        >
          {open ? 'Hide the ledger' : 'See why it scored'}
        </Button>
        <ButtonLink href={`/reports/${theirs.id}`} variant="primary">
          Open their report
        </ButtonLink>
        {onDismiss && (
          <Button
            variant="ghost"
            className="ml-auto"
            onClick={() => onDismiss(match.id)}
            disabled={dismissing}
          >
            Not my item
          </Button>
        )}
      </div>

      {open && (
        <div id={`ledger-${match.id}`} className="animate-rise border-t border-ink-3 p-4 sm:p-5">
          <MatchLedger
            components={match.components}
            score={match.score}
            tier={match.tier}
            caption={`Recomputed automatically whenever either report changes.`}
          />
        </div>
      )}
    </article>
  );
}

function MatchSide({
  label,
  report,
  highlight = false,
}: {
  label: string;
  report: MatchSummary['lostReport'];
  highlight?: boolean;
}) {
  const isLost = report.type === 'lost';
  const photo = report.images[0];

  return (
    <div
      className={cx(
        'flex gap-3 rounded-sm border p-3',
        highlight ? 'border-ink-4 bg-ink-3/45' : 'border-ink-3',
      )}
    >
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo.thumbUrl}
          alt=""
          loading="lazy"
          className="size-14 shrink-0 rounded-sm object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className={cx(
            'w-1 shrink-0 rounded-full',
            isLost ? 'bg-rose' : 'bg-emerald',
          )}
        />
      )}
      <div className="min-w-0">
        <p className="eyebrow text-paper-3">{label}</p>
        <Link
          href={`/reports/${report.id}`}
          className="mt-1 block truncate text-sm font-semibold text-paper hover:text-marigold"
        >
          {report.itemName}
        </Link>
        <p className="mt-1 font-mono text-[0.6875rem] leading-relaxed text-paper-3">
          {report.area}, {report.district}
          <br />
          {formatWhen(report.occurredAt, report.approxTime)}
        </p>
      </div>
    </div>
  );
}
