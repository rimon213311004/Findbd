import { describe, expect, it } from 'vitest';
import {
  MATCH_COMPONENT_KEYS,
  MATCH_WEIGHTS,
  tierForScore,
  type Category,
} from '@findbd/shared';
import {
  normalizeKey,
  scoreBrand,
  scoreCategory,
  scoreColour,
  scoreDate,
  scoreDescription,
  scoreLocation,
  scoreReportPair,
  scoreTime,
  tokenize,
  type ScorableReport,
} from '../modules/matching/scoring.service.js';

/**
 * The scorer's contract, pinned rule by rule.
 *
 * No database, no HTTP, no clock — every input is a literal, so a failure here
 * points at exactly one arithmetic rule rather than at "matching is broken".
 * That is why this file, not the integration suite, is where the matching
 * engine's behaviour is actually specified.
 *
 * Several tests assert an exact total. They can do that because their fixtures
 * deliberately share no distinctive words, which zeroes the 5-point description
 * component and leaves the other six weights adding up to something a person can
 * verify by hand.
 */

const LOST_AT = new Date('2026-08-10T09:00:00Z');

/** A lost report that agrees with `found()` on everything the scorer reads. */
function lost(overrides: Partial<ScorableReport> = {}): ScorableReport {
  return {
    category: 'mobile_phone',
    brand: 'Samsung',
    model: 'Galaxy S24',
    colour: 'Black',
    itemName: 'Samsung Galaxy S24',
    description: 'Cracked screen protector, top left corner',
    district: 'Dhaka',
    area: 'Mirpur 10',
    occurredAt: LOST_AT,
    approxTime: '09:30',
    ...overrides,
  };
}

/**
 * The found counterpart. Its text shares no content words with `lost()` — a
 * finder describes an object differently from its owner, and here that also keeps
 * the description component at exactly zero.
 */
function found(overrides: Partial<ScorableReport> = {}): ScorableReport {
  return {
    category: 'mobile_phone',
    brand: 'Samsung',
    model: 'Galaxy S24',
    colour: 'Black',
    itemName: 'Mobile handset',
    description: 'Picked up from a rickshaw seat near the market',
    district: 'Dhaka',
    area: 'Mirpur 10',
    occurredAt: LOST_AT,
    approxTime: '10:00',
    ...overrides,
  };
}

/** Points a single named component contributed. */
function points(result: ReturnType<typeof scoreReportPair>, key: string): number {
  const component = result.components.find((c) => c.key === key);
  if (!component) throw new Error(`no component ${key}`);
  return component.points;
}

function days(n: number): Date {
  return new Date(LOST_AT.getTime() + n * 86_400_000);
}

/* ------------------------------------------------------------ normalisation */

describe('normalizeKey', () => {
  it('folds case, whitespace and punctuation so the same brand compares equal', () => {
    expect(normalizeKey('Samsung')).toBe('samsung');
    expect(normalizeKey('  SAM SUNG ')).toBe('samsung');
    expect(normalizeKey('Sam-sung.')).toBe('samsung');
  });

  it('treats null, undefined and empty as the same absent value', () => {
    expect(normalizeKey(null)).toBe('');
    expect(normalizeKey(undefined)).toBe('');
    expect(normalizeKey('   ')).toBe('');
  });

  it('keeps Bengali letters, which the punctuation strip must not eat', () => {
    expect(normalizeKey('কালো')).toBe('কালো');
  });
});

describe('tokenize', () => {
  it('drops English stopwords and single characters', () => {
    expect([...tokenize('I lost my black phone in the bus')].sort()).toEqual([
      'black',
      'bus',
      'phone',
    ]);
  });

  it('drops Bengali stopwords but keeps Bengali content words', () => {
    // 'আমার', 'হারিয়ে', 'গেছে' are stopwords; the two content words remain.
    expect([...tokenize('আমার কালো মোবাইল হারিয়ে গেছে')].sort()).toEqual(['কালো', 'মোবাইল']);
  });

  it('de-duplicates, so repeating a word cannot inflate overlap', () => {
    expect(tokenize('black black black wallet').size).toBe(2);
  });
});

/* ---------------------------------------------------------------- location */

describe('location — 30 points', () => {
  it('gives full credit for the same area in the same district', () => {
    expect(scoreLocation(lost(), found()).score).toBe(1);
  });

  it('gives 0.65 for the same district, different area', () => {
    expect(scoreLocation(lost(), found({ area: 'Uttara' })).score).toBe(0.65);
  });

  it('gives 0.25 for the same division, different district', () => {
    // Gazipur and Dhaka are both in the Dhaka division.
    expect(scoreLocation(lost(), found({ district: 'Gazipur', area: 'Tongi' })).score).toBe(0.25);
  });

  it('gives nothing across divisions', () => {
    expect(scoreLocation(lost(), found({ district: 'Sylhet', area: 'Zindabazar' })).score).toBe(0);
  });

  it('does not credit a coincidence of area names across districts', () => {
    const a = lost({ district: 'Dhaka', area: 'Sadar' });
    const b = found({ district: 'Sylhet', area: 'Sadar' });
    // Same area *string*, different district — and every district has a Sadar.
    expect(scoreLocation(a, b).score).toBeLessThan(0.65);
  });
});

/* ---------------------------------------------------------------- category */

describe('category — 20 points', () => {
  it('gives full credit for an exact match', () => {
    expect(scoreCategory(lost(), found()).score).toBe(1);
  });

  it('gives half credit for a genuine labelling ambiguity', () => {
    expect(scoreCategory(lost(), found({ category: 'tablet' })).score).toBe(0.5);
    expect(
      scoreCategory(lost({ category: 'nid' }), found({ category: 'document' })).score,
    ).toBe(0.5);
  });

  it('gives nothing for categories that are simply different', () => {
    // A lost phone against a found laptop is a non-match, not a near-miss — even
    // though both are related to `tablet`, they are not related to each other.
    expect(scoreCategory(lost(), found({ category: 'laptop' })).score).toBe(0);
    expect(scoreCategory(lost(), found({ category: 'keys' })).score).toBe(0);
  });
});

/* ------------------------------------------------------- brand and colour */

describe('brand — 15 points, and the unknown-is-not-contradiction rule', () => {
  it('scores a blank higher than a disagreement', () => {
    const blank = scoreBrand(lost(), found({ brand: null })).score;
    const differ = scoreBrand(lost(), found({ brand: 'Xiaomi' })).score;

    expect(blank).toBe(0.4);
    expect(differ).toBe(0);
    // The whole point: a finder who cannot name the brand must not be penalised
    // as if they had named a different one.
    expect(blank).toBeGreaterThan(differ);
  });

  it('rewards an agreeing model on top of an agreeing brand', () => {
    expect(scoreBrand(lost(), found()).score).toBe(1);
    expect(scoreBrand(lost(), found({ model: 'Galaxy S24 Ultra' })).score).toBe(0.9);
    expect(scoreBrand(lost(), found({ model: 'Galaxy A15' })).score).toBe(0.7);
  });

  it('credits an overlapping brand string', () => {
    expect(scoreBrand(lost(), found({ brand: 'Samsung Galaxy', model: null })).score).toBe(0.75);
  });
});

describe('colour — 10 points', () => {
  it('scores same, similar, blank and different in that order', () => {
    const same = scoreColour(lost(), found()).score;
    const similar = scoreColour(lost(), found({ colour: 'Jet Black' })).score;
    const blank = scoreColour(lost(), found({ colour: '' })).score;
    const differ = scoreColour(lost(), found({ colour: 'White' })).score;

    expect(same).toBe(1);
    expect(similar).toBe(0.7);
    expect(blank).toBe(0.4);
    expect(differ).toBe(0);
  });
});

/* -------------------------------------------------------- date and time */

describe('date — 10 points', () => {
  it('gives full credit on the same calendar day regardless of clock time', () => {
    expect(scoreDate(lost(), found({ occurredAt: new Date('2026-08-10T23:59:00Z') })).score).toBe(1);
  });

  it('decays linearly across the 30-day window', () => {
    expect(scoreDate(lost(), found({ occurredAt: days(15) })).score).toBeCloseTo(0.5, 10);
    expect(scoreDate(lost(), found({ occurredAt: days(3) })).score).toBeCloseTo(0.9, 10);
  });

  it('bottoms out at zero rather than going negative past the window', () => {
    expect(scoreDate(lost(), found({ occurredAt: days(30) })).score).toBe(0);
    expect(scoreDate(lost(), found({ occurredAt: days(60) })).score).toBe(0);
  });
});

describe('time — 10 points, neutral when it cannot mean anything', () => {
  it('returns a neutral 0.5 when either side left the field blank', () => {
    expect(scoreTime(lost(), found({ approxTime: null })).score).toBe(0.5);
    expect(scoreTime(lost({ approxTime: null }), found({ approxTime: null })).score).toBe(0.5);
  });

  it('returns a neutral 0.5 across different days, where time of day proves nothing', () => {
    expect(scoreTime(lost(), found({ occurredAt: days(7), approxTime: '09:30' })).score).toBe(0.5);
  });

  it('scores the hour gap on the same day', () => {
    expect(scoreTime(lost(), found({ approxTime: '10:00' })).score).toBe(1);
    expect(scoreTime(lost(), found({ approxTime: '15:30' })).score).toBeCloseTo(1 - 5 / 11, 10);
    expect(scoreTime(lost(), found({ approxTime: '21:30' })).score).toBe(0);
  });

  it('ignores an unparseable time rather than throwing', () => {
    expect(scoreTime(lost(), found({ approxTime: '25:99' })).score).toBe(0.5);
    expect(scoreTime(lost(), found({ approxTime: 'morning' })).score).toBe(0.5);
  });
});

/* ------------------------------------------------------------- description */

describe('description — 5 points', () => {
  it('scores shared distinctive words, in Bengali as well as English', () => {
    const a = lost({ itemName: 'মোবাইল', description: 'আমার কালো মোবাইল হারিয়ে গেছে' });
    const b = found({ itemName: 'মোবাইল', description: 'কালো মোবাইল পাওয়া গেছে' });
    expect(scoreDescription(a, b).score).toBe(1);
  });

  it('is not fooled by shared stopwords alone', () => {
    const a = lost({ itemName: 'Wallet', description: 'I lost it in the bus' });
    const b = found({ itemName: 'Purse', description: 'I found it on the road' });
    expect(scoreDescription(a, b).score).toBe(0);
  });

  it('returns zero when there is nothing comparable', () => {
    const result = scoreDescription(lost({ itemName: 'a', description: '' }), found());
    expect(result.score).toBe(0);
    expect(result.rationale).toMatch(/not enough/i);
  });
});

/* -------------------------------------------------------------- the scorer */

describe('scoreReportPair', () => {
  it('returns one component per weight, labelled and adding up to the score', () => {
    const result = scoreReportPair(lost(), found());

    expect(result.components.map((c) => c.key)).toEqual(MATCH_COMPONENT_KEYS);
    for (const component of result.components) {
      expect(component.weight).toBe(MATCH_WEIGHTS[component.key]);
      expect(component.rationale.length).toBeGreaterThan(0);
      expect(component.points).toBeLessThanOrEqual(component.weight);
    }

    const summed = result.components.reduce((total, c) => total + c.points, 0);
    expect(summed).toBeCloseTo(result.score, 1);
  });

  it('scores a full agreement at 95 — everything but the description', () => {
    // 30 location + 20 category + 15 brand + 10 colour + 10 date + 10 time,
    // and 0 for a description written in two different people's words.
    const result = scoreReportPair(lost(), found());
    expect(result.score).toBe(95);
    expect(result.tier).toBe('excellent');
    expect(points(result, 'description')).toBe(0);
  });

  it('drops a tier when the area differs but the district does not', () => {
    const result = scoreReportPair(lost(), found({ area: 'Uttara' }));
    expect(points(result, 'location')).toBe(19.5);
    expect(result.score).toBe(84.5);
    expect(result.tier).toBe('strong');
  });

  it('drops another tier across districts in the same division', () => {
    const result = scoreReportPair(lost(), found({ district: 'Gazipur', area: 'Tongi' }));
    expect(points(result, 'location')).toBe(7.5);
    expect(result.score).toBe(72.5);
    expect(result.tier).toBe('possible');
  });

  it('discards a pair that agrees on too little', () => {
    const result = scoreReportPair(
      lost(),
      found({
        district: 'Sylhet',
        area: 'Zindabazar',
        brand: 'Xiaomi',
        model: 'Redmi 13',
        colour: 'White',
      }),
    );
    // 0 location + 20 category + 0 brand + 0 colour + 10 date + 10 time = 40.
    expect(result.score).toBe(40);
    expect(result.tier).toBeNull();
  });

  it('lifts a blank-field pair back over the floor — the rule that matters most', () => {
    // A finder who names nothing but where and when: same area, same category,
    // brand and colour unknown, same day, no time given.
    // 30 + 20 + 6 + 4 + 10 + 5 = 75.
    const result = scoreReportPair(
      lost({ approxTime: null }),
      found({ brand: null, model: null, colour: '', approxTime: null }),
    );
    expect(result.score).toBe(75);
    expect(result.tier).toBe('strong');

    // Had blanks scored zero instead of 0.4, the same pair would have been 60 —
    // barely surfaced, and one weaker signal away from never being seen.
    expect(points(result, 'brand')).toBe(6);
    expect(points(result, 'colour')).toBe(4);
  });
});

describe('scoreReportPair — the hard disqualifier', () => {
  it('refuses a found date more than the slack before the lost date', () => {
    const result = scoreReportPair(lost(), found({ occurredAt: days(-3) }));

    expect(result.tier).toBeNull();
    expect(result.score).toBe(0);
    // Short-circuited before any weighting: nothing was scored at all.
    expect(result.components).toEqual([]);
    expect(result.disqualifiedReason).toMatch(/before the item was lost/i);
  });

  it('cannot be rescued by total agreement on everything else', () => {
    const identical = scoreReportPair(lost(), found({ ...lost(), occurredAt: days(-5) }));
    expect(identical.tier).toBeNull();
  });

  it('allows one day of slack, for dates people half-remember', () => {
    const result = scoreReportPair(lost(), found({ occurredAt: days(-1) }));
    expect(result.tier).not.toBeNull();
    expect(result.disqualifiedReason).toBeUndefined();
  });
});

/* --------------------------------------------------------------- the tiers */

describe('tier boundaries', () => {
  it('places scores in the blueprint’s 90 / 75 / 60 bands', () => {
    expect(tierForScore(100)).toBe('excellent');
    expect(tierForScore(90)).toBe('excellent');
    expect(tierForScore(89.9)).toBe('strong');
    expect(tierForScore(75)).toBe('strong');
    expect(tierForScore(74.9)).toBe('possible');
    expect(tierForScore(60)).toBe('possible');
    expect(tierForScore(59.9)).toBeNull();
    expect(tierForScore(0)).toBeNull();
  });
});

/* -------------------------------------------------- symmetry and stability */

describe('properties', () => {
  it('is symmetric in everything except the date direction', () => {
    // Same day, so the one directional rule does not apply.
    const a = scoreReportPair(lost(), found());
    const b = scoreReportPair(found(), lost());
    expect(b.score).toBe(a.score);
  });

  it('never exceeds 100 or falls below 0 for any category pairing', () => {
    for (const category of ['mobile_phone', 'tablet', 'laptop', 'keys', 'other'] as Category[]) {
      const result = scoreReportPair(lost(), found({ category }));
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    }
  });
});
