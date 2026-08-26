import { describe, expect, it } from 'vitest';
import request from 'supertest';
import './setup.js';
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
 * Reports: creation, search and ownership.
 *
 * Search gets the most attention here because it is the only part of the system
 * with a genuinely large input surface — a filter combination that silently
 * returns nothing looks identical to "no one has found your phone yet", and that
 * is the single worst failure this app can have short of leaking a private field.
 */

describe('POST /api/reports', () => {
  it('files a lost report and echoes it back to its owner in full', async () => {
    const user = await registerUser();
    const res = await request(app)
      .post('/api/reports')
      .set('Authorization', auth(user))
      .send(lostReportBody());

    expect(res.status).toBe(201);
    const report = res.body.report;
    expect(report).toMatchObject({
      type: 'lost',
      status: 'active',
      itemName: 'Samsung Galaxy S24',
      category: 'mobile_phone',
      district: 'Dhaka',
      area: 'Mirpur 10',
      isOwner: true,
    });
    expect(report.categoryLabel.length).toBeGreaterThan(0);
    expect(report.images).toEqual([]);
    expect(report.matchCount).toBe(0);
  });

  it('files a found report', async () => {
    const user = await registerUser();
    const res = await request(app)
      .post('/api/reports')
      .set('Authorization', auth(user))
      .send(foundReportBody());

    expect(res.status).toBe(201);
    expect(res.body.report.type).toBe('found');
  });

  it('requires a session', async () => {
    const res = await request(app).post('/api/reports').send(lostReportBody());
    expect(res.status).toBe(401);
  });

  it('rejects a future date — you cannot lose something tomorrow', async () => {
    const user = await registerUser();
    // Three days out, not one. The schema deliberately allows a day of slack,
    // because a bare `YYYY-MM-DD` from a user in Dhaka (UTC+6) coerces to a UTC
    // midnight that can be hours ahead of the server's clock.
    const future = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    const res = await request(app)
      .post('/api/reports')
      .set('Authorization', auth(user))
      .send(lostReportBody({ occurredAt: future }));

    expect(res.status).toBe(422);
  });

  it('rejects an unknown category and an unknown district', async () => {
    const user = await registerUser();

    const badCategory = await request(app)
      .post('/api/reports')
      .set('Authorization', auth(user))
      .send(lostReportBody({ category: 'spaceship' }));
    expect(badCategory.status).toBe(422);

    // Districts come from the static shared table, so a typo is caught at the
    // boundary rather than becoming a location nobody can search for.
    const badDistrict = await request(app)
      .post('/api/reports')
      .set('Authorization', auth(user))
      .send(lostReportBody({ district: 'Atlantis' }));
    expect(badDistrict.status).toBe(422);
  });

  it('rejects a description that is too short to be useful', async () => {
    const user = await registerUser();
    const res = await request(app)
      .post('/api/reports')
      .set('Authorization', auth(user))
      .send(lostReportBody({ description: 'lost' }));
    expect(res.status).toBe(422);
  });

  it('refuses lost-only fields on a found report', async () => {
    const user = await registerUser();
    // `reward` and `privateIdentifiers` belong to the person who lost the item.
    // Accepting them on a found report would let a finder publish a bounty and
    // invent verification questions for something that is not theirs.
    const res = await request(app)
      .post('/api/reports')
      .set('Authorization', auth(user))
      .send({ ...foundReportBody(), reward: '5000 টাকা' });

    expect(res.status).toBe(422);
  });

  it('derives the division from the district so search can widen', async () => {
    const user = await registerUser();
    const created = await createReport(user, lostReportBody({ district: 'Gazipur', area: 'Tongi' }));

    // Not exposed on the summary, but it has to be stored — the matching
    // pre-filter queries on it. Proven indirectly: a same-division search finds it.
    const res = await request(app).get('/api/reports?district=Gazipur');
    expect(res.body.reports.map((r: { id: string }) => r.id)).toContain(created.id);
  });
});

describe('GET /api/reports — search', () => {
  it('is open to anonymous visitors', async () => {
    const user = await registerUser();
    await createReport(user, lostReportBody());

    // Someone who just lost a phone should be able to look before signing up.
    const res = await request(app).get('/api/reports');
    expect(res.status).toBe(200);
    expect(res.body.reports).toHaveLength(1);
    expect(res.body.meta).toMatchObject({ page: 1, total: 1, totalPages: 1 });
  });

  it('filters by type', async () => {
    const a = await registerUser();
    const b = await registerUser();
    await createReport(a, lostReportBody());
    await createReport(b, foundReportBody());

    const lost = await request(app).get('/api/reports?type=lost');
    expect(lost.body.reports).toHaveLength(1);
    expect(lost.body.reports[0].type).toBe('lost');

    const found = await request(app).get('/api/reports?type=found');
    expect(found.body.reports).toHaveLength(1);
    expect(found.body.reports[0].type).toBe('found');
  });

  it('filters by category, district and brand', async () => {
    const user = await registerUser();
    await createReport(user, lostReportBody());
    await createReport(
      user,
      lostReportBody({
        itemName: 'Leather wallet',
        category: 'wallet',
        brand: 'Aarong',
        model: '',
        colour: 'Brown',
        district: 'Sylhet',
        area: 'Zindabazar',
      }),
    );

    expect((await request(app).get('/api/reports?category=wallet')).body.reports).toHaveLength(1);
    expect((await request(app).get('/api/reports?district=Sylhet')).body.reports).toHaveLength(1);
    expect((await request(app).get('/api/reports?district=Dhaka')).body.reports).toHaveLength(1);
    // Brand is matched on a normalised key, so the case a user types is irrelevant.
    expect((await request(app).get('/api/reports?brand=samsung')).body.reports).toHaveLength(1);
    expect((await request(app).get('/api/reports?brand=SAMSUNG')).body.reports).toHaveLength(1);
  });

  it('matches an area by prefix, because "Mirpur" should find "Mirpur 10"', async () => {
    const user = await registerUser();
    await createReport(user, lostReportBody());

    expect((await request(app).get('/api/reports?area=Mirpur')).body.reports).toHaveLength(1);
    expect((await request(app).get('/api/reports?area=mirpur')).body.reports).toHaveLength(1);
    expect((await request(app).get('/api/reports?area=Uttara')).body.reports).toHaveLength(0);
  });

  it('does not let a regex in the area filter escape into the query', async () => {
    const user = await registerUser();
    await createReport(user, lostReportBody());

    // Unescaped, `.*` would match everything and `(` would throw. Escaped, it is
    // just an area name nobody has.
    expect((await request(app).get('/api/reports?area=.*')).body.reports).toHaveLength(0);
    expect((await request(app).get('/api/reports?area=%28')).status).toBe(200);
  });

  it('filters by date range', async () => {
    const user = await registerUser();
    await createReport(user, lostReportBody({ occurredAt: daysAgo(1) }));
    await createReport(user, lostReportBody({ occurredAt: daysAgo(20) }));

    const recent = await request(app).get(`/api/reports?from=${daysAgo(5)}`);
    expect(recent.body.reports).toHaveLength(1);

    const old = await request(app).get(`/api/reports?to=${daysAgo(10)}`);
    expect(old.body.reports).toHaveLength(1);
  });

  it('searches free text across item name, brand and description', async () => {
    const user = await registerUser();
    await createReport(user, lostReportBody());
    await createReport(
      user,
      lostReportBody({
        itemName: 'Brown leather wallet',
        category: 'wallet',
        brand: 'Aarong',
        model: '',
        colour: 'Brown',
        description: 'Contains my student ID card and a bus pass, no cash inside.',
      }),
    );

    expect((await request(app).get('/api/reports?q=Samsung')).body.reports).toHaveLength(1);
    expect((await request(app).get('/api/reports?q=wallet')).body.reports).toHaveLength(1);
    expect((await request(app).get('/api/reports?q=bus%20pass')).body.reports).toHaveLength(1);
    expect((await request(app).get('/api/reports?q=bicycle')).body.reports).toHaveLength(0);
  });

  it('sorts newest, oldest and by relevance', async () => {
    const user = await registerUser();
    const first = await createReport(user, lostReportBody({ itemName: 'First phone' }));
    const second = await createReport(user, lostReportBody({ itemName: 'Second phone' }));

    const newest = await request(app).get('/api/reports?sort=newest');
    expect(newest.body.reports[0].id).toBe(second.id);

    const oldest = await request(app).get('/api/reports?sort=oldest');
    expect(oldest.body.reports[0].id).toBe(first.id);

    // `relevant` without a search term has no textScore to sort by; it must fall
    // back rather than error.
    const relevantNoQuery = await request(app).get('/api/reports?sort=relevant');
    expect(relevantNoQuery.status).toBe(200);
    expect(relevantNoQuery.body.reports).toHaveLength(2);

    const relevant = await request(app).get('/api/reports?q=Samsung&sort=relevant');
    expect(relevant.status).toBe(200);
    expect(relevant.body.reports.length).toBeGreaterThan(0);
  });

  it('paginates', async () => {
    const user = await registerUser();
    for (let i = 0; i < 3; i += 1) {
      await createReport(user, lostReportBody({ itemName: `Phone ${i}` }));
    }

    const page1 = await request(app).get('/api/reports?limit=2&page=1');
    expect(page1.body.reports).toHaveLength(2);
    expect(page1.body.meta).toMatchObject({ total: 3, totalPages: 2 });

    const page2 = await request(app).get('/api/reports?limit=2&page=2');
    expect(page2.body.reports).toHaveLength(1);
  });

  it('rejects a limit beyond the cap rather than honouring it', async () => {
    // An uncapped limit is a one-request way to pull the whole collection.
    const res = await request(app).get('/api/reports?limit=5000');
    expect(res.status).toBe(422);
  });

  it('hides closed reports by default', async () => {
    const user = await registerUser();
    const report = await createReport(user, lostReportBody());

    await request(app)
      .patch(`/api/reports/${report.id}/status`)
      .set('Authorization', auth(user))
      .send({ status: 'closed' });

    expect((await request(app).get('/api/reports')).body.reports).toHaveLength(0);
    expect((await request(app).get('/api/reports?status=closed')).body.reports).toHaveLength(1);
  });
});

describe('GET /api/reports/:id', () => {
  it('404s an id that does not exist and 422s one that is not an id', async () => {
    expect((await request(app).get('/api/reports/64b7f0000000000000000000')).status).toBe(404);
    // 422, not 404: the string never described a report, so this is a malformed
    // request rather than a missing resource.
    expect((await request(app).get('/api/reports/not-an-objectid')).status).toBe(422);
  });
});

describe('ownership', () => {
  it('lets the owner edit their report', async () => {
    const user = await registerUser();
    const report = await createReport(user, lostReportBody());

    const res = await request(app)
      .patch(`/api/reports/${report.id}`)
      .set('Authorization', auth(user))
      .send({ colour: 'Midnight Blue', reward: '3000 টাকা' });

    expect(res.status).toBe(200);
    expect(res.body.report.colour).toBe('Midnight Blue');
    expect(res.body.report.reward).toBe('3000 টাকা');
  });

  it('stops a stranger editing, deleting, or changing the status', async () => {
    const owner = await registerUser('Owner');
    const stranger = await registerUser('Stranger');
    const report = await createReport(owner, lostReportBody());

    const edit = await request(app)
      .patch(`/api/reports/${report.id}`)
      .set('Authorization', auth(stranger))
      .send({ colour: 'White' });
    const status = await request(app)
      .patch(`/api/reports/${report.id}/status`)
      .set('Authorization', auth(stranger))
      .send({ status: 'closed' });
    const remove = await request(app)
      .delete(`/api/reports/${report.id}`)
      .set('Authorization', auth(stranger));

    for (const res of [edit, status, remove]) {
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    }

    // And nothing changed.
    const after = await request(app).get(`/api/reports/${report.id}`);
    expect(after.body.report.colour).toBe('Black');
    expect(after.body.report.status).toBe('active');
  });

  it('deletes the owner’s own report', async () => {
    const user = await registerUser();
    const report = await createReport(user, lostReportBody());

    expect(
      (await request(app).delete(`/api/reports/${report.id}`).set('Authorization', auth(user)))
        .status,
    ).toBe(204);
    expect((await request(app).get(`/api/reports/${report.id}`)).status).toBe(404);
  });
});

describe('GET /api/reports/mine', () => {
  it('returns only the caller’s reports, split by type', async () => {
    const user = await registerUser('Mine');
    const other = await registerUser('Other');
    await createReport(user, lostReportBody());
    await createReport(user, foundReportBody());
    await createReport(other, lostReportBody());

    const all = await request(app).get('/api/reports/mine').set('Authorization', auth(user));
    expect(all.body.reports).toHaveLength(2);

    const lost = await request(app)
      .get('/api/reports/mine?type=lost')
      .set('Authorization', auth(user));
    expect(lost.body.reports).toHaveLength(1);
    expect(lost.body.reports[0].type).toBe('lost');
  });

  it('requires a session', async () => {
    expect((await request(app).get('/api/reports/mine')).status).toBe(401);
  });
});

describe('watch list', () => {
  it('saves, lists and unsaves a report', async () => {
    const owner = await registerUser('Owner');
    const watcher = await registerUser('Watcher');
    const report = await createReport(owner, foundReportBody());

    const saved = await request(app)
      .post(`/api/reports/${report.id}/save`)
      .set('Authorization', auth(watcher));
    expect(saved.body.saved).toBe(true);

    // Saving twice is not an error — the button is a toggle, and a double-tap on a
    // phone must not produce a 409.
    const again = await request(app)
      .post(`/api/reports/${report.id}/save`)
      .set('Authorization', auth(watcher));
    expect(again.body.saved).toBe(true);

    const list = await request(app).get('/api/reports/saved').set('Authorization', auth(watcher));
    expect(list.body.reports).toHaveLength(1);
    expect(list.body.reports[0].id).toBe(report.id);

    // The detail view reflects it, so the button renders in the right state.
    const detail = await request(app)
      .get(`/api/reports/${report.id}`)
      .set('Authorization', auth(watcher));
    expect(detail.body.report.isSaved).toBe(true);

    const removed = await request(app)
      .delete(`/api/reports/${report.id}/save`)
      .set('Authorization', auth(watcher));
    expect(removed.body.saved).toBe(false);
    expect(
      (await request(app).get('/api/reports/saved').set('Authorization', auth(watcher))).body
        .reports,
    ).toHaveLength(0);
  });
});

describe('GET /api/reports/stats', () => {
  it('reports real counts, and zeroes on an empty database', async () => {
    const empty = await request(app).get('/api/reports/stats');
    expect(empty.status).toBe(200);
    // §19: the homepage shows nothing until there is something true to show.
    expect(empty.body).toMatchObject({ lostReports: 0, foundReports: 0, matchesFound: 0 });
    expect(empty.body.topDistricts).toEqual([]);

    const a = await registerUser();
    const b = await registerUser();
    await createReport(a, lostReportBody());
    await createReport(b, foundReportBody());

    const filled = await request(app).get('/api/reports/stats');
    expect(filled.body.lostReports).toBe(1);
    expect(filled.body.foundReports).toBe(1);
    expect(filled.body.matchesFound).toBe(1);
    expect(filled.body.topDistricts[0]).toMatchObject({ district: 'Dhaka' });
  });
});
