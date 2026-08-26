import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

/**
 * A watched report — the blueprint's §12 "Watch Report" button.
 *
 * Its own collection rather than an array on the user, because the interesting
 * query runs the other way: "is this report saved by the person looking at it?"
 * needs an index on the pair, which an embedded array cannot give.
 */
const savedReportSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    reportId: { type: Schema.Types.ObjectId, ref: 'Report', required: true, index: true },
  },
  { timestamps: true },
);

/** Saving twice is the same as saving once. */
savedReportSchema.index({ userId: 1, reportId: 1 }, { unique: true });
savedReportSchema.index({ userId: 1, createdAt: -1 });

export type SavedReportFields = InferSchemaType<typeof savedReportSchema> & {
  createdAt: Date;
  updatedAt: Date;
};
export type SavedReportDoc = HydratedDocument<SavedReportFields>;
export const SavedReport = model('SavedReport', savedReportSchema);
