import mongoose from 'mongoose';
import syncPlugin from '../plugins/sync.plugin.js';
import { encrypt, decrypt } from '../utils/encryption.util.js';
import { SYMPTOMS, FLOWS, MOODS, ENERGY_LEVELS } from '../utils/constants.util.js';
import { registerUserOwnedModel } from '../services/userData.service.js';

// One entry per user per date. Wellness logging only: nothing here diagnoses anything.
const symptomLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, required: true }, // DBI user id
    date: { type: String, required: true }, // 'YYYY-MM-DD'
    symptoms: [{ type: String, enum: SYMPTOMS }],
    flow: { type: String, enum: FLOWS, default: null },
    mood: { type: String, enum: MOODS, default: null },
    energy: { type: String, enum: ENERGY_LEVELS, default: null },
    note: { type: String, set: encrypt, get: decrypt },
    deletedAt: { type: Date, default: null }, // soft delete, so deletions can sync
  },
  { timestamps: true }
);

symptomLogSchema.index({ user: 1, date: 1 }, { unique: true });

symptomLogSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id,
    date: this.date,
    symptoms: [...this.symptoms],
    flow: this.flow,
    mood: this.mood,
    energy: this.energy,
    note: this.note ?? null,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

symptomLogSchema.plugin(syncPlugin);

const SymptomLog = mongoose.model('SymptomLog', symptomLogSchema);
registerUserOwnedModel(SymptomLog);

export default SymptomLog;
