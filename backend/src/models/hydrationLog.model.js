import mongoose from 'mongoose';
import syncPlugin from '../plugins/sync.plugin.js';
import { registerUserOwnedModel } from '../services/userData.service.js';

// Records that a hydration reminder was marked done. No water quantity is ever stored.
const hydrationLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, required: true }, // DBI user id
    date: { type: String, required: true }, // 'YYYY-MM-DD'
    time: { type: String, required: true }, // 'HH:MM', one of the user's hydration reminder times
    done: { type: Boolean, default: false },
  },
  { timestamps: true }
);

hydrationLogSchema.index({ user: 1, date: 1, time: 1 }, { unique: true });

hydrationLogSchema.plugin(syncPlugin);

const HydrationLog = mongoose.model('HydrationLog', hydrationLogSchema);
registerUserOwnedModel(HydrationLog);

export default HydrationLog;
