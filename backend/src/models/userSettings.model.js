import mongoose from 'mongoose';
import syncPlugin from '../plugins/sync.plugin.js';
import { registerUserOwnedModel } from '../services/userData.service.js';

// Reminder preferences are added with the Reminder model in Phase 4.
const userSettingsSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true }, // DBI user id
    cycleLength: { type: Number, min: 15, max: 60 },
    periodDuration: { type: Number, min: 1, max: 15 },
  },
  { timestamps: true }
);

userSettingsSchema.plugin(syncPlugin);

const UserSettings = mongoose.model('UserSettings', userSettingsSchema);
registerUserOwnedModel(UserSettings);

export default UserSettings;
