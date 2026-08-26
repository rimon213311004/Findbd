import {
  MATCH_COMPONENT_LABELS,
  MATCH_WEIGHTS,
  areRelatedCategories,
  divisionForDistrict,
  tierForScore,
  type Category,
  type MatchComponentKey,
  type MatchTier,
  type ScoreComponent,
} from '@findbd/shared';
import { env } from '../../config/env.js';

/**
 * The Smart Matching Engine's scorer.
 *
 * Pure: no database, no I/O, no clock beyond what is passed in. That is what
 * makes it the most thoroughly tested file in the API — every rule below is
 * pinned by `scoring.test.ts`, and tuning a weight cannot quietly change
 * behaviour somewhere else.
 *
 * Each component returns agreement in 0..1, which is multiplied by its share of
 * the 100-point total from `MATCH_WEIGHTS`. Two principles run through all of it:
 *
 * 1. **Unknown is not contradiction.** A finder picks up a phone in a rickshaw;
 *    they cannot tell you its brand, and they certainly cannot tell you its
 *    model. Scoring a blank field as 0 would push exactly the pairs FindBD
 *    exists to find below the threshold. A blank scores a neutral 0.4 — better
 *    than a contradiction, worse than an agreement.
 *
 * 2. **One rule is absolute.** You cannot find a thing before it is lost. A found
 *    report dated more than MATCH_DATE_SLACK_DAYS before the lost date is not a
 *    weak match, it is not a match, and no amount of agreement elsewhere can
 *    rescue it. That check short-circuits before any weight is applied.
 */

const DAY_MS = 86_400_000;

/** Neutral score for "one side simply does not know". See principle 1 above. */
const UNKNOWN = 0.4;

/* ------------------------------------------------------------ normalisation */

/**
 * Characters that carry meaning in a word, for a platform used in Bengali.
 *
 * `\p{M}` is the part that is easy to leave out and expensive to leave out.
 * Bengali writes its vowels as combining marks — the ো in কালো and the া in
 * আমার are Unicode category `Mn`/`Mc`, not `L`. A class of just letters and
 * digits deletes them, so কালো becomes কল, and splitting on that class shatters
 * মোবাইল into ম, ব and ইল. Every Bengali report would then be compared as
 * gibberish against every other one.
 */
const WORD_CHARS = /[^\p{L}\p{N}\p{M}]+/gu;

/**
 * Zero-width joiners are removed rather than treated as separators. They control
 * how a conjunct is drawn and nothing else, so two spellings that differ only by
 * one are the same word — but splitting on them would cut that word in half.
 */
const JOINERS = /[‌‍]/g;

/**
 * Fold a user-typed value to a comparison key.
 *
 * Bangladesh's second-hand market writes the same brand a dozen ways —
 * "Samsung", "samsung ", "SAMSUNG", "Sam sung". Case, punctuation and internal
 * whitespace all have to go before two strings can be compared for equality at
 * all.
 */
export function normalizeKey(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(JOINERS, '')
    .replace(WORD_CHARS, '')
    .trim();
}

/**
 * English and Bengali stopwords.
 *
 * Without these, description overlap is dominated by "the", "a", "আমার" — every
 * report shares them, so every pair scores a spurious few points and the
 * component stops discriminating. Bengali is included because reports are filed
 * in both languages, frequently in the same sentence.
 *
 * Normalised on the way in, so a stopword typed with a nukta as two code points
 * still matches the same word composed as one.
 */
const STOPWORDS = new Set(
  [
    // English
    'a', 'an', 'the', 'and', 'or', 'but', 'if', 'of', 'at', 'by', 'for', 'with',
    'about', 'into', 'to', 'from', 'in', 'on', 'is', 'are', 'was', 'were', 'be',
    'been', 'it', 'its', 'this', 'that', 'these', 'those', 'i', 'my', 'me', 'we',
    'our', 'you', 'your', 'he', 'she', 'his', 'her', 'they', 'their', 'there',
    'here', 'when', 'while', 'have', 'has', 'had', 'do', 'does', 'did', 'not',
    'no', 'very', 'some', 'any', 'also', 'then', 'than', 'so', 'as', 'one',
    'lost', 'found', 'please', 'help', 'item', 'thing',
    // Bengali
    'আমার', 'আমি', 'আমরা', 'আমাদের', 'তার', 'তাদের', 'এই', 'ওই', 'সেই', 'একটি',
    'একটা', 'এবং', 'বা', 'কিন্তু', 'যে', 'যা', 'হয়', 'ছিল', 'করে', 'করা',
    'থেকে', 'জন্য', 'সাথে', 'মধ্যে', 'উপর', 'নিচে', 'কাছে', 'পাওয়া', 'হারানো',
    'হারিয়ে', 'গেছে', 'গিয়েছে', 'দয়া', 'করুন', 'না', 'খুব', 'অনেক', 'কিছু',
  ].map((word) => word.normalize('NFKC')),
);

/**
 * Content words of a free-text field, de-duplicated.
 *
 * The length filter counts UTF-16 units, so a two-code-point Bengali syllable
 * survives it while an English initial does not. That asymmetry is the right way
 * round: "S" carries nothing, কী carries a word.
 */
export function tokenize(text: string): Set<string> {
  const tokens = (text ?? '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(JOINERS, '')
    .split(WORD_CHARS)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
  return new Set(tokens);
}

/** UTC calendar-day index, so two timestamps on the same date compare equal. */
function dayIndex(d: Date): number {
  return Math.floor(d.getTime() / DAY_MS);
}

/** Minutes since midnight for 'HH:mm', or null when absent/unparseable. */
function minutesOfDay(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null;
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/* ------------------------------------------------------------------- inputs */

/**
 * Everything the scorer reads. A plain shape rather than a Mongoose document, so
 * the tests can construct a candidate in one literal and so no scoring rule can
 * ever depend on something that is only available in the database.
 */
export interface ScorableReport {
  category: Category;
  brand?: string | null;
  model?: string | null;
  colour?: string | null;
  itemName: string;
  description: string;
  district: string;
  area: string;
  /** Optional: derived from `district` when absent. */
  division?: string | null;
  occurredAt: Date;
  approxTime?: string | null;
}

export interface ScoreResult {
  /** 0–100, one decimal. */
  score: number;
  /** `null` when the pair is below the floor, or disqualified outright. */
  tier: MatchTier | null;
  components: ScoreComponent[];
  /** Set only when a hard rule rejected the pair before scoring. */
  disqualifiedReason?: string;
}

interface RawComponent {
  score: number;
  rationale: string;
}

/* --------------------------------------------------------------- components */

/**
 * Location — 30 points, the heaviest single signal.
 *
 * Distance is not available: the blueprint rules out the Maps API, so there are
 * no coordinates to measure between. What there is instead is a three-level
 * administrative hierarchy, and it turns out to carry most of the information.
 * Same area is a strong signal in a city of 20 million; same district is a real
 * but much weaker one; same division barely narrows anything, which is why it
 * scores 0.25 rather than something that sounds generous.
 */
export function scoreLocation(lost: ScorableReport, found: ScorableReport): RawComponent {
  const lostArea = normalizeKey(lost.area);
  const foundArea = normalizeKey(found.area);
  const lostDistrict = normalizeKey(lost.district);
  const foundDistrict = normalizeKey(found.district);

  if (lostDistrict === foundDistrict && lostArea && lostArea === foundArea) {
    return { score: 1, rationale: `Both in ${found.area}, ${found.district}` };
  }
  if (lostDistrict === foundDistrict) {
    return { score: 0.65, rationale: `Same district (${found.district}), different area` };
  }

  const lostDivision = lost.division || divisionForDistrict(lost.district) || '';
  const foundDivision = found.division || divisionForDistrict(found.district) || '';
  if (lostDivision && lostDivision === foundDivision) {
    return { score: 0.25, rationale: `Same division (${foundDivision}), different district` };
  }

  return { score: 0, rationale: `Different areas — ${lost.district} vs ${found.district}` };
}

/**
 * Category — 20 points.
 *
 * A partial credit of 0.5 goes to genuinely confusable labels only (see
 * `CATEGORY_CONFUSION_GROUPS`): a 7" tablet filed as a phone, an NID filed as a
 * document. A lost phone against a found laptop is not a near-miss, so it scores
 * zero rather than a consolation.
 */
export function scoreCategory(lost: ScorableReport, found: ScorableReport): RawComponent {
  if (lost.category === found.category) {
    return { score: 1, rationale: 'Same category' };
  }
  if (areRelatedCategories(lost.category, found.category)) {
    return { score: 0.5, rationale: 'Closely related categories — easy to file either way' };
  }
  return { score: 0, rationale: 'Different categories' };
}

/**
 * Brand — 15 points. Also absorbs the model number when both sides give one:
 * "Galaxy S24" against "Galaxy S24 Ultra" is a stronger signal than "Samsung"
 * alone, and the blueprint gives model no weight of its own.
 */
export function scoreBrand(lost: ScorableReport, found: ScorableReport): RawComponent {
  const a = normalizeKey(lost.brand);
  const b = normalizeKey(found.brand);

  if (!a || !b) {
    return {
      score: UNKNOWN,
      rationale: a || b ? 'Only one side named a brand' : 'Neither side named a brand',
    };
  }
  if (a !== b) {
    // Substring either way catches "samsung" against "samsunggalaxy".
    if (a.includes(b) || b.includes(a)) {
      return { score: 0.75, rationale: `Brands overlap — "${lost.brand}" / "${found.brand}"` };
    }
    return { score: 0, rationale: `Different brands — "${lost.brand}" vs "${found.brand}"` };
  }

  const ma = normalizeKey(lost.model);
  const mb = normalizeKey(found.model);
  if (ma && mb) {
    if (ma === mb) return { score: 1, rationale: `Same brand and model (${found.brand} ${found.model})` };
    if (ma.includes(mb) || mb.includes(ma)) {
      return { score: 0.9, rationale: `Same brand, similar model (${lost.model} / ${found.model})` };
    }
    return { score: 0.7, rationale: `Same brand (${found.brand}), different model` };
  }
  return { score: 1, rationale: `Same brand (${found.brand})` };
}

/**
 * Colour — 10 points.
 *
 * Same neutral-on-blank rule as brand, and for a sharper reason: colour is the
 * field people describe least consistently. "Black" and "dark grey" are the same
 * phone to everyone except a string comparison, so a genuine disagreement here is
 * weaker evidence than a genuine disagreement about brand — but there is nothing
 * cheap and reliable to do about it without a colour vocabulary, and inventing
 * one would be guessing on the user's behalf.
 */
export function scoreColour(lost: ScorableReport, found: ScorableReport): RawComponent {
  const a = normalizeKey(lost.colour);
  const b = normalizeKey(found.colour);

  if (!a || !b) {
    return {
      score: UNKNOWN,
      rationale: a || b ? 'Only one side gave a colour' : 'Neither side gave a colour',
    };
  }
  if (a === b) return { score: 1, rationale: `Both ${found.colour}` };
  if (a.includes(b) || b.includes(a)) {
    return { score: 0.7, rationale: `Similar colours — ${lost.colour} / ${found.colour}` };
  }
  return { score: 0, rationale: `Different colours — ${lost.colour} vs ${found.colour}` };
}

/**
 * Date — 10 points. Full credit on the same day, decaying linearly to zero across
 * MATCH_DATE_WINDOW_DAYS.
 *
 * Linear rather than exponential on purpose: an item found nine days after it was
 * lost is a perfectly ordinary story — it sat in a drawer at the shop until
 * someone thought to look online — and an exponential curve would have written it
 * off by then.
 */
export function scoreDate(lost: ScorableReport, found: ScorableReport): RawComponent {
  const gap = dayIndex(found.occurredAt) - dayIndex(lost.occurredAt);

  if (gap === 0) return { score: 1, rationale: 'Same day' };

  const magnitude = Math.abs(gap);
  const window = env.MATCH_DATE_WINDOW_DAYS;
  const score = Math.max(0, 1 - magnitude / window);

  const direction = gap > 0 ? 'after' : 'before';
  const days = `${magnitude} day${magnitude === 1 ? '' : 's'}`;
  return {
    score,
    rationale:
      score > 0
        ? `Found ${days} ${direction} it was lost`
        : `Found ${days} ${direction} — outside the ${window}-day window`,
  };
}

/**
 * Time — 10 points, and the component that most needs a "not applicable" answer.
 *
 * Time of day only means anything if the two reports are about the same day; a
 * 14:30 loss and a 14:30 find a week apart is coincidence, not evidence. And most
 * people leave the field blank. Both cases return a neutral 0.5 rather than 0,
 * because "we don't know" must not read as "these disagree" — with 10 points at
 * stake, scoring silence as a contradiction would cost a pair a whole tier.
 */
export function scoreTime(lost: ScorableReport, found: ScorableReport): RawComponent {
  const a = minutesOfDay(lost.approxTime);
  const b = minutesOfDay(found.approxTime);

  if (a === null || b === null) {
    return { score: 0.5, rationale: 'No time given on both sides — not counted against the pair' };
  }
  if (dayIndex(lost.occurredAt) !== dayIndex(found.occurredAt)) {
    return { score: 0.5, rationale: 'Different days, so time of day is not comparable' };
  }

  const gapMinutes = Math.abs(a - b);
  const gapHours = gapMinutes / 60;
  if (gapHours <= 1) return { score: 1, rationale: 'Within an hour of each other' };
  if (gapHours >= 12) {
    return { score: 0, rationale: `About ${Math.round(gapHours)} hours apart on the same day` };
  }
  // Decay across the remaining 11 hours of the half-day.
  return {
    score: Math.max(0, 1 - (gapHours - 1) / 11),
    rationale: `About ${Math.round(gapHours)} hours apart`,
  };
}

/**
 * Description — 5 points, via the Dice coefficient over content-word sets.
 *
 * The lightest weight in the blueprint, and correctly so: free text is where
 * people write the least comparable things. It earns its place as a tie-breaker —
 * "has a red Naruto sticker on the back" appearing on both sides is worth more
 * than its five points suggest, because by then everything else already agreed.
 *
 * `itemName` is folded into the token set: one person's "item name" is another's
 * first line of description, and honouring that split would penalise whoever
 * wrote it in the other box.
 */
export function scoreDescription(lost: ScorableReport, found: ScorableReport): RawComponent {
  const a = tokenize(`${lost.itemName} ${lost.description}`);
  const b = tokenize(`${found.itemName} ${found.description}`);

  if (a.size === 0 || b.size === 0) {
    return { score: 0, rationale: 'Not enough distinctive words to compare' };
  }

  let shared = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const token of small) if (large.has(token)) shared += 1;

  // Dice: 2|A∩B| / (|A|+|B|). Preferred over Jaccard here because it is kinder to
  // a short description compared against a long one, which is the common case.
  const dice = (2 * shared) / (a.size + b.size);

  return {
    score: Math.min(1, dice),
    rationale:
      shared === 0
        ? 'No distinctive words in common'
        : `${shared} distinctive word${shared === 1 ? '' : 's'} in common`,
  };
}

/* ------------------------------------------------------------------- scorer */

const SCORERS: Record<
  MatchComponentKey,
  (lost: ScorableReport, found: ScorableReport) => RawComponent
> = {
  location: scoreLocation,
  category: scoreCategory,
  brand: scoreBrand,
  colour: scoreColour,
  date: scoreDate,
  time: scoreTime,
  description: scoreDescription,
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Score a lost report against a found report.
 *
 * Argument order matters: `scoreDate` is directional, because "found three days
 * after it was lost" and "found three days before" are not the same claim.
 */
export function scoreReportPair(lost: ScorableReport, found: ScorableReport): ScoreResult {
  /* ── Hard disqualifier, before any weighting ─────────────────────────────── */
  const dayGap = dayIndex(found.occurredAt) - dayIndex(lost.occurredAt);
  if (dayGap < -env.MATCH_DATE_SLACK_DAYS) {
    return {
      score: 0,
      tier: null,
      components: [],
      disqualifiedReason: `Found ${Math.abs(dayGap)} days before the item was lost`,
    };
  }

  const components: ScoreComponent[] = [];
  let total = 0;

  for (const key of Object.keys(MATCH_WEIGHTS) as MatchComponentKey[]) {
    const weight = MATCH_WEIGHTS[key];
    const raw = SCORERS[key](lost, found);
    const score = Math.min(1, Math.max(0, raw.score));
    const points = weight * score;
    total += points;
    components.push({
      key,
      label: MATCH_COMPONENT_LABELS[key],
      weight,
      score: round1(score * 100) / 100,
      points: round1(points),
      rationale: raw.rationale,
    });
  }

  const score = round1(total);
  return { score, tier: tierForScore(score), components };
}
