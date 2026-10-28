import mongoose from 'mongoose';
import syncPlugin from '../plugins/sync.plugin.js';
import { REMINDER_TYPES, TIME_OF_DAY_RE } from '../utils/constants.util.js';
import { registerUserOwnedModel } from '../services/userData.service.js';

// Preferences only. The phone schedules the notifications; GET /reminders/schedule tells it what.
const timeValidator = { validator: (v) => TIME_OF_DAY_RE.test(v), message: 'Time must be HH:MM (24-hour)' };

const reminderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, required: true }, // DBI user id
    type: { type: String, enum: REMINDER_TYPES, required: true },
    enabled: { type: Boolean, default: false }, // off until the user turns it on
    paused: { type: Boolean, default: false }, // paused until the user resumes
    snoozedUntil: { type: String, default: null }, // last 'YYYY-MM-DD' that is skipped
    leadDays: { type: Number, min: 0, max: 7 }, // period reminders: days before the estimated start
    timeOfDay: { type: String, validate: timeValidator }, // period and daily_log reminders
    times: { type: [{ type: String, validate: timeValidator }], default: [] }, // hydration reminders
  },
  { timestamps: true }
);

reminderSchema.index({ user: 1, type: 1 }, { unique: true });

reminderSchema.plugin(syncPlugin);

const Reminder = mongoose.model('Reminder', reminderSchema);
registerUserOwnedModel(Reminder);

export default Reminder;
