/**
 * @findbd/shared — the single source of truth for domain enums, reference data,
 * and API contracts. Both the Express API and the Next.js client import from
 * here, so validation rules, TypeScript types, and form logic cannot drift.
 */

export * from './enums.js';
export * from './data/bd-locations.js';

export * as authSchemas from './schemas/auth.js';
export * as reportSchemas from './schemas/report.js';
export * as matchSchemas from './schemas/match.js';
export * as notificationSchemas from './schemas/notification.js';
export * as commonSchemas from './schemas/common.js';

/* Frequently-used types re-exported flat for ergonomics. */
export type { AuthPayload, AuthUser, LoginInput, RegisterInput } from './schemas/auth.js';
export type {
  CreateFoundReportInput,
  CreateLostReportInput,
  CreateReportInput,
  ListMyReportsQuery,
  ListReportsQuery,
  PrivateIdentifier,
  ReportDetail,
  ReportImage,
  ReportSort,
  ReportSummary,
  SetReportStatusInput,
  UpdateReportInput,
} from './schemas/report.js';
export type {
  ListMatchesQuery,
  MarkMatchesSeenInput,
  MatchSummary,
  ScoreComponent,
} from './schemas/match.js';
export type {
  ListNotificationsQuery,
  MarkNotificationsReadInput,
  NotificationItem,
  NotificationsPage,
} from './schemas/notification.js';
export type { ApiErrorBody, PageMeta, Pagination } from './schemas/common.js';

export { MAX_PRIVATE_IDENTIFIERS, REPORT_SORTS } from './schemas/report.js';
