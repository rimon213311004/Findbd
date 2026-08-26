/**
 * Model barrel. Importing this registers every schema against the default
 * Mongoose connection — the server entrypoint and the test harness both rely on
 * that, so `ref:` population never fails with "Schema hasn't been registered".
 */

export { User, type UserDoc, type UserFields } from './user.model.js';
export { Session, type SessionDoc, type SessionFields } from './session.model.js';
export {
  Report,
  REPORT_PRIVATE_PATHS,
  type ReportDoc,
  type ReportFields,
} from './report.model.js';
export { Match, type MatchDoc, type MatchFields } from './match.model.js';
export {
  Notification,
  type NotificationDoc,
  type NotificationFields,
} from './notification.model.js';
export {
  SavedReport,
  type SavedReportDoc,
  type SavedReportFields,
} from './saved-report.model.js';
