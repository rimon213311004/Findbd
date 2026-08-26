import { describe, expect, it } from 'vitest';
import request from 'supertest';
import './setup.js';
import {
  app,
  auth,
  createReport,
  foundReportBody,
  lostReportBody,
  registerUser,
} from './helpers.js';

/**
 * The privacy gate, tested from outside.
 *
 * §12 of the blueprint states plainly that Private Identification Details are not
 * public, and §11 that the exact location is not either. Those are the two
 * promises FindBD makes to someone who has just lost something valuable, and
 * they are the two that a careless `res.json(report)` breaks silently — the
 * response still looks right, it just contains three fields too many.
 *
 * So these tests assert on the serialised HTTP body, not on a serializer's return
 * value. A unit test of `toReportDetail` would pass even if a route stopped
 * calling it.
 */

/** Every path that must never reach someone who does not own the report. */
const PRIVATE_PATHS = ['locationDescription', 'privateIdentifiers', 'additionalDetails'] as const;

describe('report detail — private fields', () => {
  it('gives the owner everything they filed', async () => {
    const owner = await registerUser('Owner');
    const created = await createReport(owner, lostReportBody());

    const res = await request(app)
      .get(`/api/reports/${created.id}`)
      .set('Authorization', auth(owner));

    expect(res.status).toBe(200);
    const report = res.body.report;

    expect(report.isOwner).toBe(true);
    expect(report.locationDescription).toBe(
      'Left it on the seat of a green CNG near the metro pillar 12.',
    );
    expect(report.privateIdentifiers).toHaveLength(1);
    expect(report.privateIdentifiers[0].answer).toBe('A photo of my daughter');
  });

  it('omits the private fields entirely for a different signed-in user', async () => {
    const owner = await registerUser('Owner');
    const stranger = await registerUser('Stranger');
    const created = await createReport(owner, lostReportBody());

    const res = await request(app)
      .get(`/api/reports/${created.id}`)
      .set('Authorization', auth(stranger));

    expect(res.status).toBe(200);
    const report = res.body.report;

    expect(report.isOwner).toBe(false);
    // Omitted, not nulled. A `null` still tells a reader the field exists and is
    // being withheld; more importantly, a client that renders `report.reward ??
    // report.locationDescription` cannot accidentally surface an empty string.
    for (const path of PRIVATE_PATHS) {
      expect(report).not.toHaveProperty(path);
    }
  });

  it('omits them for an anonymous visitor too', async () => {
    const owner = await registerUser('Owner');
    const created = await createReport(owner, lostReportBody());

    const res = await request(app).get(`/api/reports/${created.id}`);

    expect(res.status).toBe(200);
    expect(res.body.report.isOwner).toBe(false);
    for (const path of PRIVATE_PATHS) {
      expect(res.body.report).not.toHaveProperty(path);
    }
  });

  /**
   * The strongest form of the assertion: search the whole raw response text.
   *
   * A nested copy of the answer — inside a populated owner, an audit trail, a
   * debug echo of the request body — would slip past a property check on the top
   * level object but not past this.
   */
  it('leaks no private answer anywhere in the raw response body', async () => {
    const owner = await registerUser('Owner');
    const stranger = await registerUser('Stranger');
    const created = await createReport(
      owner,
      lostReportBody({
        privateIdentifiers: [
          { question: 'Engraving on the back?', answer: 'ZEBRA-SECRET-7781' },
        ],
        locationDescription: 'Third floor locker room, PINEAPPLE-LANDMARK-42',
      }),
    );

    const res = await request(app)
      .get(`/api/reports/${created.id}`)
      .set('Authorization', auth(stranger));

    expect(res.text).not.toContain('ZEBRA-SECRET-7781');
    expect(res.text).not.toContain('PINEAPPLE-LANDMARK-42');
    // The public half is still there — this is a privacy gate, not a blackout.
    expect(res.text).toContain('Mirpur 10');
  });

  it('shows the found report’s additional details only to its finder', async () => {
    const finder = await registerUser('Finder');
    const stranger = await registerUser('Stranger');
    const created = await createReport(finder, foundReportBody());

    const asFinder = await request(app)
      .get(`/api/reports/${created.id}`)
      .set('Authorization', auth(finder));
    expect(asFinder.body.report.additionalDetails).toMatch(/photo of a small girl/);

    const asStranger = await request(app)
      .get(`/api/reports/${created.id}`)
      .set('Authorization', auth(stranger));
    expect(asStranger.body.report).not.toHaveProperty('additionalDetails');
  });
});

describe('report list — summaries', () => {
  it('never carries a private field, for anyone, owner included', async () => {
    const owner = await registerUser('Owner');
    await createReport(owner, lostReportBody());

    // Even the owner gets summaries in a list: there is no interface that needs
    // ownership answers in a card, and a list is the easiest place to forget.
    const res = await request(app).get('/api/reports').set('Authorization', auth(owner));

    expect(res.status).toBe(200);
    expect(res.body.reports).toHaveLength(1);
    for (const path of PRIVATE_PATHS) {
      expect(res.body.reports[0]).not.toHaveProperty(path);
    }
    expect(res.text).not.toContain('green CNG');
  });

  it('publishes area and district but not the exact spot', async () => {
    const owner = await registerUser('Owner');
    await createReport(owner, lostReportBody());

    const res = await request(app).get('/api/reports');
    const summary = res.body.reports[0];

    // §11: "Mirpur 10, Dhaka" — area and district, and nothing finer.
    expect(summary.area).toBe('Mirpur 10');
    expect(summary.district).toBe('Dhaka');
    expect(summary).not.toHaveProperty('locationDescription');
  });

  it('exposes the owner’s name but not their email', async () => {
    const owner = await registerUser('Rahim Uddin');
    await createReport(owner, lostReportBody());

    const res = await request(app).get('/api/reports');

    expect(res.body.reports[0].owner.fullName).toBe('Rahim Uddin');
    // Contact details are Phase 4's problem, behind a verified claim. Until then
    // publishing an email address would make every report a spam target.
    expect(res.text).not.toContain(owner.email);
  });
});
