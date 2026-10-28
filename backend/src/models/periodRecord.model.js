import mongoose from 'mongoose';
import syncPlugin from '../plugins/sync.plugin.js';
import { encrypt, decrypt } from '../utils/encryption.util.js';
import { diffDays } from '../utils/dates.util.js';
import { registerUserOwnedModel } from '../services/userData.service.js';

// One document per actual, user-confirmed period. Predictions are never stored here.
// Dates stay plain so they can be queried and sorted; notes are encrypted at field level.
const periodRecordSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, required: true }, // DBI user id
    startDate: { type: String, required: true }, // 'YYYY-MM-DD'
    endDate: { type: String, default: null },
    source: { type: String, enum: ['actual'], default: 'actual' },
    notes: { type: String, set: encrypt, get: decrypt },
    deletedAt: { type: Date, default: null }, // soft delete, so deletions can sync
  },
  { timestamps: true }
);

periodRecordSchema.index({ user: 1, deletedAt: 1, startDate: -1 });

periodRecordSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id,
    startDate: this.startDate,
    endDate: this.endDate,
    durationDays: this.endDate ? diffDays(this.startDate, this.endDate) + 1 : null,
    source: this.source,
    notes: this.notes ?? null,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

periodRecordSchema.plugin(syncPlugin);

const PeriodRecord = mongoose.model('PeriodRecord', periodRecordSchema);
registerUserOwnedModel(PeriodRecord);

export default PeriodRecord;
