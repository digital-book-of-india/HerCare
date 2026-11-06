import mongoose from 'mongoose';

// Singleton document (key = 'global') holding admin-managed defaults and content.
const adminSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'global', unique: true },
    featureEnabled: { type: Boolean, default: true },
    defaultCycleLength: { type: Number, default: 28, min: 15, max: 60 },
    defaultPeriodDuration: { type: Number, default: 5, min: 1, max: 15 },
    defaultChecklistItems: [
      {
        _id: false,
        id: { type: String, required: true },
        label: { type: String, required: true },
      },
    ],
    disclaimerText: { type: String, default: '' },
    privacyText: { type: String, default: '' },
  },
  { timestamps: true }
);

export default mongoose.model('AdminSettings', adminSettingsSchema);
