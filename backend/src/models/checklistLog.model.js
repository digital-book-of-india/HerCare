import mongoose from 'mongoose';
import syncPlugin from '../plugins/sync.plugin.js';
import { registerUserOwnedModel } from '../services/userData.service.js';

// One row per user, date and item. A new day simply has no rows yet, so the checklist starts
// fresh with no reset job, and every past day keeps its history.
const checklistLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, required: true }, // DBI user id
    date: { type: String, required: true }, // 'YYYY-MM-DD'
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'ChecklistItem', required: true },
    completed: { type: Boolean, default: false },
  },
  { timestamps: true }
);

checklistLogSchema.index({ user: 1, date: 1, itemId: 1 }, { unique: true });

checklistLogSchema.plugin(syncPlugin);

const ChecklistLog = mongoose.model('ChecklistLog', checklistLogSchema);
registerUserOwnedModel(ChecklistLog);

export default ChecklistLog;
