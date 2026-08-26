import { describe, expect, it } from 'vitest';
import request from 'supertest';
import './setup.js';
import { Match } from '../models/index.js';
import {
  app,
  auth,
  createReport,
  daysAgo,
  foundReportBody,
  lostReportBody,
  registerUser,
} from './helpers.js';

/**
 * The matching engine against a real database.
 *
 * `scoring.test.ts` already pins the arithmetic, so nothing here re-tests a
 * weight. What is left — and what only a database can show — is everything around
 * the scorer: that the candidate pre-filter finds the right reports, that the
 * unique index makes recomputation idempotent, that the notification lands, and
 * that a user is never matched against themselves.
 */

describe('matching on report creation', () => {
  it('matches a found report against an existing lost one and notifies the loser', async () => {
    const loser = await registerUser('Loser');
    const finder = await registerUser('Finder');

    const lost = await createReport(loser, lostReportBody());
    const foundDetail = await createReport(finder, foundReportBody());

    // The finder sees it immediately on their own confirmation screen — matching
    // runs inline, so `matchCount` is already right on the response.
    expect(foundDetail.matchCount).toBe(1);

    const matches = await request(app).get('/api/matches').set('Authorization', auth(loser));
    expect(matches.status).toBe(200);
    expect(matches.body.matches).toHaveLength(1);

    const match = matches.body.matches[0];
    expect(match.lostReport.id).toBe(lost.id);
    expect(match.foundReport.id).toBe(foundDetail.id);
    expect(match.tier).toBe('excellent');
    expect(match.score).toBeGreaterThanOrEqual(90);
    expect(match.viewerSide).toBe('lost');

    // The per-component breakdown is the feature, not a debug aid: a user decides
    // whether to act on a match by reading why it scored.
    expect(match.components).toHaveLength(7);
    expect(match.components.every((c: { rationale: string }) => c.rationale.length > 0)).toBe(true);

    const notifications = await request(app)
      .get('/api/notifications')
      .set('Authorization', auth(loser));
    expect(notifications.body.unreadCount).toBe(1);
    expect(notifications.body.notifications[0].type).toBe('match.found');
    expect(notifications.body.notifications[0].link).toContain('/dashboard/matches');
  });

  it('matches in the other direction too — lost filed after found', async () => {
    const finder = await registerUser('Finder');
    const loser = await registerUser('Loser');

    // The found report exists first, so the pre-filter has to run from the lost
    // side. The found date is also a day *before* the lost date — inside the one
    // day of slack the scorer allows for imprecise recollection, so it survives
    // the found-before-lost disqualifier.
    await createReport(finder, foundReportBody({ occurredAt: daysAgo(3) }));
    const lostDetail = await createReport(loser, lostReportBody({ occurredAt: daysAgo(2) }));

    expect(lostDetail.matchCount).toBe(1);
  });

  it('never matches a user against their own reports', async () => {
    const user = await registerUser('Both Sides');

    // A perfect pair, except one person filed both. This is a common real case —
    // people report a find and then also report their own loss — and surfacing it
    // as a match would be noise at best.
    await createReport(user, lostReportBody());
    const found = await createReport(user, foundReportBody());

    expect(found.matchCount).toBe(0);
    const matches = await request(app).get('/api/matches').set('Authorization', auth(user));
    expect(matches.body.matches).toHaveLength(0);
  });

  it('does not match a pair that scores below the floor', async () => {
    const loser = await registerUser('Loser');
    const finder = await registerUser('Finder');

    await createReport(loser, lostReportBody());
    const found = await createReport(
      finder,
      foundReportBody({
        category: 'keys',
        district: 'Sylhet',
        area: 'Zindabazar',
        brand: 'Nissan',
        model: '',
        colour: 'Silver',
      }),
    );

    expect(found.matchCount).toBe(0);
  });

  it('refuses a found report dated before the loss, however well it agrees', async () => {
    const loser = await registerUser('Loser');
    const finder = await registerUser('Finder');

    await createReport(loser, lostReportBody({ occurredAt: daysAgo(2) }));
    // Identical in every other respect, found five days before it was lost.
    const found = await createReport(finder, foundReportBody({ occurredAt: daysAgo(7) }));

    expect(found.matchCount).toBe(0);
    expect(await Match.countDocuments({})).toBe(0);
  });

  it('flips both reports to the matched status', async () => {
    const loser = await registerUser('Loser');
    const finder = await registerUser('Finder');

    const lost = await createReport(loser, lostReportBody());
    await createReport(finder, foundReportBody());

    const refreshed = await request(app)
      .get(`/api/reports/${lost.id}`)
      .set('Authorization', auth(loser));
    expect(refreshed.body.report.status).toBe('matched');
    expect(refreshed.body.report.statusLabel.length).toBeGreaterThan(0);
  });
});

describe('recompute', () => {
  it('upserts rather than duplicating — the unique index earning its place', async () => {
    const loser = await registerUser('Loser');
    const finder = await registerUser('Finder');

    await createReport(loser, lostReportBody());
    await createReport(finder, foundReportBody());
    expect(await Match.countDocuments({})).toBe(1);

    const first = await request(app).post('/api/matches/recompute').set('Authorization', auth(loser));
    expect(first.status).toBe(200);
    const second = await request(app).post('/api/matches/recompute').set('Authorization', auth(loser));
    expect(second.status).toBe(200);

    // Three runs of the same pair, one Match document. This is what makes it safe
    // to defer a real job queue: re-running matching is free of consequence.
    expect(await Match.countDocuments({})).toBe(1);

    const matches = await request(app).get('/api/matches').set('Authorization', auth(loser));
    expect(matches.body.matches).toHaveLength(1);
  });

  it('does not re-notify for a match the user has already been told about', async () => {
    const loser = await registerUser('Loser');
    const finder = await registerUser('Finder');

    await createReport(loser, lostReportBody());
    await createReport(finder, foundReportBody());

    await request(app).post('/api/matches/recompute').set('Authorization', auth(loser));
    await request(app).post('/api/matches/recompute').set('Authorization', auth(loser));

    // One notification, no matter how many times the score is recalculated —
    // otherwise the recompute button becomes a way to spam yourself.
    const notifications = await request(app)
      .get('/api/notifications')
      .set('Authorization', auth(loser));
    expect(notifications.body.total).toBe(1);
  });
});

describe('match visibility and lifecycle', () => {
  it('shows the same match to the finder, from their side', async () => {
    const loser = await registerUser('Loser');
    const finder = await registerUser('Finder');

    await createReport(loser, lostReportBody());
    await createReport(finder, foundReportBody());

    const asFinder = await request(app).get('/api/matches').set('Authorization', auth(finder));
    expect(asFinder.body.matches).toHaveLength(1);
    expect(asFinder.body.matches[0].viewerSide).toBe('found');
  });

  it('hides it from everyone else, and 404s a direct lookup', async () => {
    const loser = await registerUser('Loser');
    const finder = await registerUser('Finder');
    const stranger = await registerUser('Stranger');

    await createReport(loser, lostReportBody());
    await createReport(finder, foundReportBody());
    const matchId = (
      await request(app).get('/api/matches').set('Authorization', auth(loser))
    ).body.matches[0].id;

    const list = await request(app).get('/api/matches').set('Authorization', auth(stranger));
    expect(list.body.matches).toHaveLength(0);

    // 404 rather than 403: telling a stranger "that exists but is not yours"
    // confirms two people are in contact over a lost item.
    const direct = await request(app)
      .get(`/api/matches/${matchId}`)
      .set('Authorization', auth(stranger));
    expect(direct.status).toBe(404);
  });

  it('requires a session at all', async () => {
    const res = await request(app).get('/api/matches');
    expect(res.status).toBe(401);
  });

  it('carries neither side’s private fields into the match payload', async () => {
    const loser = await registerUser('Loser');
    const finder = await registerUser('Finder');

    await createReport(
      loser,
      lostReportBody({
        privateIdentifiers: [{ question: 'Wallpaper?', answer: 'OCTOPUS-CODE-9' }],
      }),
    );
    await createReport(
      finder,
      foundReportBody({ additionalDetails: 'Screen shows WALRUS-CODE-4' }),
    );

    // Being matched with someone is not consent to read their answers — in either
    // direction. Each side sees the other's report as a summary.
    const asLoser = await request(app).get('/api/matches').set('Authorization', auth(loser));
    expect(asLoser.text).not.toContain('WALRUS-CODE-4');
    expect(asLoser.text).not.toContain('OCTOPUS-CODE-9');

    const asFinder = await request(app).get('/api/matches').set('Authorization', auth(finder));
    expect(asFinder.text).not.toContain('OCTOPUS-CODE-9');
    expect(asFinder.text).not.toContain('WALRUS-CODE-4');
  });

  it('dismisses a match and keeps it out of the default list', async () => {
    const loser = await registerUser('Loser');
    const finder = await registerUser('Finder');

    await createReport(loser, lostReportBody());
    await createReport(finder, foundReportBody());
    const matchId = (
      await request(app).get('/api/matches').set('Authorization', auth(loser))
    ).body.matches[0].id;

    const dismissed = await request(app)
      .post(`/api/matches/${matchId}/dismiss`)
      .set('Authorization', auth(loser));
    expect(dismissed.status).toBe(200);
    expect(dismissed.body.match.status).toBe('dismissed');

    const list = await request(app).get('/api/matches').set('Authorization', auth(loser));
    expect(list.body.matches).toHaveLength(0);

    // Still retrievable on request, for someone who changes their mind.
    const explicit = await request(app)
      .get('/api/matches?status=dismissed')
      .set('Authorization', auth(loser));
    expect(explicit.body.matches).toHaveLength(1);
  });

  it('counts matches by tier for the dashboard', async () => {
    const loser = await registerUser('Loser');
    const finder = await registerUser('Finder');

    await createReport(loser, lostReportBody());
    await createReport(finder, foundReportBody());

    const counts = await request(app).get('/api/matches/counts').set('Authorization', auth(loser));
    expect(counts.body).toMatchObject({ total: 1, excellent: 1, strong: 0, possible: 0 });
    expect(counts.body.unseen).toBe(1);
  });

  it('filters by tier', async () => {
    const loser = await registerUser('Loser');
    const finder = await registerUser('Finder');

    await createReport(loser, lostReportBody());
    await createReport(finder, foundReportBody());

    const excellent = await request(app)
      .get('/api/matches?tier=excellent')
      .set('Authorization', auth(loser));
    expect(excellent.body.matches).toHaveLength(1);

    const possible = await request(app)
      .get('/api/matches?tier=possible')
      .set('Authorization', auth(loser));
    expect(possible.body.matches).toHaveLength(0);
  });
});

describe('candidate pre-filter', () => {
  it('finds a cross-district pair in the same division at a lower tier', async () => {
    const loser = await registerUser('Loser');
    const finder = await registerUser('Finder');

    await createReport(loser, lostReportBody());
    const found = await createReport(
      finder,
      foundReportBody({ district: 'Gazipur', area: 'Tongi' }),
    );

    // 72.5 by the scorer's arithmetic — above the 60 floor, so the pre-filter has
    // to reach across districts within a division or the pair is never scored.
    expect(found.matchCount).toBe(1);
    const matches = await request(app).get('/api/matches').set('Authorization', auth(loser));
    expect(matches.body.matches[0].tier).toBe('possible');
  });

  it('reaches across a confusable category boundary', async () => {
    const loser = await registerUser('Loser');
    const finder = await registerUser('Finder');

    await createReport(loser, lostReportBody({ category: 'mobile_phone' }));
    // Filed as a tablet — a 7" device goes either way. 10 of the 20 category
    // points, still comfortably over the floor.
    const found = await createReport(finder, foundReportBody({ category: 'tablet' }));

    expect(found.matchCount).toBe(1);
  });

  it('does not match two lost reports against each other', async () => {
    const a = await registerUser('One');
    const b = await registerUser('Two');

    await createReport(a, lostReportBody());
    const second = await createReport(b, lostReportBody());

    // Two people losing the same model of phone in the same place is a
    // coincidence, not a match. Only opposite types are ever candidates.
    expect(second.matchCount).toBe(0);
  });
});
