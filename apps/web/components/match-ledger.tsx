'use client';

import type { MatchTier, ScoreComponent } from '@findbd/shared';
import { cx } from './ui';

/**
 * The Match Ledger — the one element FindBD is meant to be remembered by.
 *
 * A lost-and-found site that says "87% match" and stops there is asking to be
 * trusted. This shows the arithmetic instead: seven rows, each with the points it
 * was worth, the points it earned, and one line saying why. It is set in mono and
 * ruled like an inspection slip because that is what it is — a receipt for a
 * judgement, not a dashboard widget.
 *
 * The same component renders the demo on the landing page and the real score on a
 * match, so the promise made on the homepage is literally the artefact delivered.
 */

const TIER_STAMP: Record<MatchTier, { label: string; ring: string; text: string }> = {
  excellent: { label: 'Excellent match', ring: 'border-[#0a6b4d]', text: 'text-[#0a6b4d]' },
  strong: { label: 'Strong match', ring: 'border-[#9a6a05]', text: 'text-[#9a6a05]' },
  possible: { label: 'Possible match', ring: 'border-ink/45', text: 'text-ink/60' },
};

interface MatchLedgerProps {
  components: ScoreComponent[];
  score: number;
  tier: MatchTier;
  /** Free text under the total — "computed 3 hours ago", say. */
  caption?: string;
  /** Stagger the bars in on mount. On by default; reduced motion overrides it. */
  animate?: boolean;
  className?: string;
}

export function MatchLedger({
  components,
  score,
  tier,
  caption,
  animate = true,
  className,
}: MatchLedgerProps) {
  const stamp = TIER_STAMP[tier];

  return (
    <div className={cx('notice overflow-hidden font-mono', className)}>
      {/* Header: what this slip is. */}
      <div className="flex items-baseline justify-between gap-3 border-b border-dashed border-ink/25 px-4 py-3 sm:px-5">
        <span className="eyebrow text-ink/55">Match ledger</span>
        <span className="eyebrow text-ink/40">100 pts possible</span>
      </div>

      {/* The seven components. */}
      <ul className="divide-y divide-ink/10">
        {components.map((component, index) => (
          <LedgerRow
            key={component.key}
            component={component}
            index={index}
            animate={animate}
          />
        ))}
      </ul>

      {/* Total, and the stamp. */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-t-2 border-double border-ink/35 bg-ink/4 px-4 py-4 sm:px-5">
        <div>
          <p className="eyebrow text-ink/55">Total</p>
          <p className="mt-1 flex items-baseline gap-1 leading-none">
            <span className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">
              {score.toFixed(1)}
            </span>
            <span className="text-sm text-ink/45">/100</span>
          </p>
          {caption && <p className="mt-2 text-[0.6875rem] text-ink/50">{caption}</p>}
        </div>

        <p
          className={cx(
            'eyebrow rotate-[-4deg] rounded-sm border-2 px-3 py-1.5 leading-none',
            stamp.ring,
            stamp.text,
          )}
        >
          {stamp.label}
        </p>
      </div>
    </div>
  );
}

function LedgerRow({
  component,
  index,
  animate,
}: {
  component: ScoreComponent;
  index: number;
  animate: boolean;
}) {
  const filled = Math.max(0, Math.min(1, component.score));
  // Full marks, partial, or nothing — three states, because "10.0 of 10" and
  // "4.0 of 10" mean different things to someone deciding whether to act.
  const bar =
    filled >= 0.999 ? 'bg-[#0a6b4d]' : filled <= 0.001 ? 'bg-ink/25' : 'bg-marigold-dim';

  return (
    <li className="px-4 py-2.5 sm:px-5">
      <div className="flex items-baseline gap-3">
        <span className="flex-1 truncate text-[0.8125rem] font-medium text-ink">
          {component.label}
        </span>
        <span className="text-[0.6875rem] tabular-nums text-ink/40">×{component.weight}</span>
        <span className="w-14 text-right text-[0.8125rem] font-bold tabular-nums text-ink">
          {component.points.toFixed(1)}
        </span>
      </div>

      <div className="mt-1.5 flex items-center gap-3">
        <span className="h-[3px] flex-1 overflow-hidden rounded-full bg-ink/10">
          <span
            className={cx('block h-full origin-left rounded-full', bar)}
            style={{
              width: `${filled * 100}%`,
              animation: animate
                ? `ledger-fill 0.55s cubic-bezier(0.22,1,0.36,1) ${0.06 * index + 0.1}s both`
                : undefined,
            }}
          />
        </span>
      </div>

      <p className="mt-1 text-[0.6875rem] leading-snug text-ink/55">{component.rationale}</p>
    </li>
  );
}
