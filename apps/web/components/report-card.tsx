import Link from 'next/link';
import type { ReportSummary } from '@findbd/shared';
import { formatWhen, timeAgo } from '../lib/format';
import { PaperBadge, cx } from './ui';

/**
 * One report, as a notice on the wall.
 *
 * The location line is `area, district` and nothing else. That is not a layout
 * choice — the exact spot is the owner's alone, and the only way to be sure this
 * card can never print it is for the card never to receive it. `ReportSummary`
 * carries no private field, so this component could not leak one if it tried.
 */

export function ReportCard({
  report,
  className,
  compact = false,
}: {
  report: ReportSummary;
  className?: string;
  compact?: boolean;
}) {
  const isLost = report.type === 'lost';
  const photo = report.images[0];

  return (
    <Link
      href={`/reports/${report.id}`}
      className={cx(
        'notice group flex flex-col overflow-hidden transition-transform duration-200',
        'hover:-translate-y-0.5 focus-visible:-translate-y-0.5',
        className,
      )}
    >
      {/* The type stripe. Rose or emerald, and it is the first thing you see. */}
      <span
        aria-hidden="true"
        className={cx('h-1 w-full shrink-0', isLost ? 'bg-rose' : 'bg-emerald')}
      />

      <div className="flex flex-1 gap-4 p-4">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo.thumbUrl}
            alt=""
            width={photo.width}
            height={photo.height}
            loading="lazy"
            className="size-20 shrink-0 rounded-sm border border-ink/10 object-cover sm:size-24"
          />
        ) : (
          <span
            aria-hidden="true"
            className="grid size-20 shrink-0 place-items-center rounded-sm border border-dashed border-ink/20 bg-ink/4 font-mono text-[0.625rem] uppercase tracking-widest text-ink/35 sm:size-24"
          >
            No photo
          </span>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-2">
            <PaperBadge tone={isLost ? 'lost' : 'found'}>{isLost ? 'Lost' : 'Found'}</PaperBadge>
            <PaperBadge>{report.categoryLabel}</PaperBadge>
            {report.matchCount > 0 && (
              <PaperBadge tone="found">
                {report.matchCount} match{report.matchCount === 1 ? '' : 'es'}
              </PaperBadge>
            )}
          </div>

          <h3 className="mt-2 truncate text-card-title font-bold text-ink group-hover:underline">
            {report.itemName}
          </h3>

          {!compact && (
            <p className="mt-1 line-clamp-2 text-[0.8125rem] leading-snug text-ink/65">
              {report.description}
            </p>
          )}

          <dl className="mt-auto pt-3 font-mono text-[0.6875rem] text-ink/60">
            <div className="flex gap-2">
              <dt className="sr-only">Place</dt>
              <dd className="truncate">
                {report.area}, {report.district}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="sr-only">When</dt>
              <dd>{formatWhen(report.occurredAt, report.approxTime)}</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* The reward strip, torn along the bottom like the real thing. */}
      {report.reward ? (
        <div className="torn-edge bg-marigold px-4 pt-2 pb-4">
          <p className="font-mono text-[0.6875rem] font-bold uppercase tracking-widest text-ink">
            Reward · {report.reward}
          </p>
        </div>
      ) : (
        <p className="border-t border-dashed border-ink/15 px-4 py-2 font-mono text-[0.625rem] text-ink/40">
          Filed {timeAgo(report.createdAt)}
        </p>
      )}
    </Link>
  );
}

/** A one-line version, for the dashboard's dense lists. */
export function ReportRow({ report }: { report: ReportSummary }) {
  const isLost = report.type === 'lost';

  return (
    <Link
      href={`/reports/${report.id}`}
      className="flex items-center gap-3 border-b border-ink-3 px-3 py-3 transition-colors last:border-0 hover:bg-ink-2 sm:gap-4 sm:px-4"
    >
      <span
        aria-hidden="true"
        className={cx('h-9 w-1 shrink-0 rounded-full', isLost ? 'bg-rose' : 'bg-emerald')}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-paper">{report.itemName}</span>
        <span className="mt-0.5 block truncate font-mono text-[0.6875rem] text-paper-3">
          {report.area}, {report.district} · {report.statusLabel}
        </span>
      </span>
      {report.matchCount > 0 && (
        <span className="shrink-0 rounded-full bg-emerald/15 px-2 py-1 font-mono text-[0.625rem] font-bold text-emerald">
          {report.matchCount}
        </span>
      )}
    </Link>
  );
}
