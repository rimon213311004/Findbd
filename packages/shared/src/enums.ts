/**
 * Domain enumerations shared by the API and the web client.
 *
 * Each is a frozen tuple so it can be fed straight to `z.enum(...)` and still
 * yield a narrow union type. Import the tuple for validation, the type for
 * signatures.
 */

/* ------------------------------------------------------------------- people */

export const ROLES = ['user', 'admin'] as const;
export type Role = (typeof ROLES)[number];

/* ------------------------------------------------------------------ reports */

/**
 * The two halves of the platform. Everything else — search, scoring, claims —
 * is a function of pairing one against the other.
 */
export const REPORT_TYPES = ['lost', 'found'] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

/**
 * Report lifecycle.
 *
 * One state machine serves both report types. The blueprint names the terminal
 * success state "RECOVERED" for a lost item and "RETURNED" for a found one, but
 * those are the same event seen from two sides — a single `resolved` state with
 * a per-type *label* keeps the machine honest, where two states would allow a
 * lost report to be marked `returned` and mean nothing. See `statusLabel`.
 */
export const REPORT_STATUSES = ['active', 'matched', 'claimed', 'resolved', 'closed'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/** Legal transitions. Enforced in the report service; no ad-hoc status writes. */
export const REPORT_STATUS_TRANSITIONS: Readonly<
  Record<ReportStatus, readonly ReportStatus[]>
> = Object.freeze({
  /** `matched` is set by the matching engine, not by a person. */
  active: ['matched', 'claimed', 'resolved', 'closed'],
  /** Back to `active` when every match is dismissed. */
  matched: ['active', 'claimed', 'resolved', 'closed'],
  claimed: ['matched', 'resolved', 'closed'],
  resolved: [],
  closed: ['active'],
});

export function canTransitionReport(from: ReportStatus, to: ReportStatus): boolean {
  return REPORT_STATUS_TRANSITIONS[from].includes(to);
}

/** Only these are eligible to be scored against a new report. */
export const MATCHABLE_STATUSES = ['active', 'matched'] as const satisfies readonly ReportStatus[];

/**
 * Human labels. `resolved` reads differently depending on which side you are on:
 * the person who lost it recovered it; the person who found it returned it.
 */
export function statusLabel(type: ReportType, status: ReportStatus): string {
  if (status === 'resolved') return type === 'lost' ? 'Recovered' : 'Returned';
  return { active: 'Active', matched: 'Matched', claimed: 'Claimed', closed: 'Closed' }[status];
}

/* --------------------------------------------------------------- categories */

export const CATEGORIES = [
  'mobile_phone',
  'wallet',
  'bag',
  'keys',
  'nid',
  'passport',
  'document',
  'laptop',
  'tablet',
  'watch',
  'jewellery',
  'books',
  'camera',
  'earbuds',
  'other',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Readonly<Record<Category, string>> = Object.freeze({
  mobile_phone: 'Mobile Phone',
  wallet: 'Wallet',
  bag: 'Bag',
  keys: 'Keys',
  nid: 'NID / ID Card',
  passport: 'Passport',
  document: 'Certificate / Document',
  laptop: 'Laptop',
  tablet: 'Tablet',
  watch: 'Watch',
  jewellery: 'Jewellery',
  books: 'Books',
  camera: 'Camera',
  earbuds: 'Earbuds',
  other: 'Other',
});

/**
 * Categories a single real object might plausibly be filed under by two
 * different people.
 *
 * This is NOT a similarity graph — a lost phone and a found laptop are not a
 * near-miss, they are a non-match. Each group below is a genuine labelling
 * ambiguity: a 7" tablet and a 7" phone, a purse that is either a wallet or a
 * small bag, an NID that its finder files as "document".
 *
 * Adding a group loosens matching for every user. Keep it to real confusions.
 */
const CATEGORY_CONFUSION_GROUPS: readonly (readonly Category[])[] = Object.freeze([
  ['mobile_phone', 'tablet'],
  ['laptop', 'tablet'],
  ['nid', 'passport', 'document'],
  ['wallet', 'bag'],
  ['watch', 'jewellery'],
  ['books', 'document'],
]);

/** Categories plausibly confusable with `category`, excluding itself. */
export function relatedCategories(category: Category): Category[] {
  const out = new Set<Category>();
  for (const group of CATEGORY_CONFUSION_GROUPS) {
    if (group.includes(category)) {
      for (const member of group) if (member !== category) out.add(member);
    }
  }
  return [...out];
}

export function areRelatedCategories(a: Category, b: Category): boolean {
  return CATEGORY_CONFUSION_GROUPS.some((group) => group.includes(a) && group.includes(b));
}

/* ----------------------------------------------------------------- matching */

/**
 * The blueprint's scoring weights, as percentages of a 100-point total.
 *
 * This object is the single source of truth: the scorer derives its arithmetic
 * from it, the UI derives its breakdown labels from it, and the assertion below
 * makes a typo that breaks the total a compile-time error rather than a subtly
 * wrong match score in production.
 */
export const MATCH_WEIGHTS = Object.freeze({
  location: 30,
  category: 20,
  brand: 15,
  colour: 10,
  date: 10,
  time: 10,
  description: 5,
});
export type MatchComponentKey = keyof typeof MATCH_WEIGHTS;

export const MATCH_COMPONENT_KEYS = Object.keys(MATCH_WEIGHTS) as MatchComponentKey[];

export const MATCH_COMPONENT_LABELS: Readonly<Record<MatchComponentKey, string>> = Object.freeze({
  location: 'Location',
  category: 'Category',
  brand: 'Brand',
  colour: 'Colour',
  date: 'Date',
  time: 'Time',
  description: 'Description',
});

/**
 * Compile-time guard that the weights still sum to 100.
 *
 * `MATCH_WEIGHT_TOTAL` is checked at module load — cheap, and it fires the first
 * time the process starts rather than silently producing scores that can never
 * reach the "excellent" threshold.
 */
export const MATCH_WEIGHT_TOTAL = Object.values(MATCH_WEIGHTS).reduce((a, b) => a + b, 0);
if (MATCH_WEIGHT_TOTAL !== 100) {
  throw new Error(`MATCH_WEIGHTS must sum to 100, got ${MATCH_WEIGHT_TOTAL}`);
}

export const MATCH_TIERS = ['possible', 'strong', 'excellent'] as const;
export type MatchTier = (typeof MATCH_TIERS)[number];

/** Lower bound of each tier, per the blueprint's 90 / 75 / 60 bands. */
export const MATCH_TIER_MINIMUM: Readonly<Record<MatchTier, number>> = Object.freeze({
  excellent: 90,
  strong: 75,
  possible: 60,
});

/** Below this, a pair is not worth showing anyone. */
export const MATCH_SCORE_FLOOR = MATCH_TIER_MINIMUM.possible;

/** The tier a score falls in, or `null` when it is below the floor. */
export function tierForScore(score: number): MatchTier | null {
  if (score >= MATCH_TIER_MINIMUM.excellent) return 'excellent';
  if (score >= MATCH_TIER_MINIMUM.strong) return 'strong';
  if (score >= MATCH_TIER_MINIMUM.possible) return 'possible';
  return null;
}

export const MATCH_TIER_LABELS: Readonly<Record<MatchTier, string>> = Object.freeze({
  excellent: 'Excellent Match',
  strong: 'Strong Match',
  possible: 'Possible Match',
});

export const MATCH_STATUSES = ['new', 'notified', 'dismissed'] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

/* ------------------------------------------------------------ notifications */

/**
 * The full set, including types only Phases 4–5 will emit. Declaring them now
 * means adding claims and chat later needs no migration of stored documents.
 */
export const NOTIFICATION_TYPES = [
  'match.found',
  'report.status_changed',
  'claim.received',
  'claim.accepted',
  'claim.rejected',
  'message.received',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/* ---------------------------------------------------------------- media --- */

/** Report photos. Enforced by magic-byte sniffing, not by the declared MIME. */
export const ALLOWED_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AllowedImageMime = (typeof ALLOWED_IMAGE_MIME)[number];

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGES_PER_REPORT = 5;
