import mongoose from 'mongoose';
import { TIP_CATEGORIES, TIP_SHOW_WHEN } from '../utils/constants.util.js';

// Prewritten, clinically reviewed content. Users only ever see tips that are both
// `active` and have a `reviewedAt` date (set by the admin after review).
const tipSchema = new mongoose.Schema(
  {
    category: { type: String, enum: TIP_CATEGORIES, required: true },
    title: { type: String, required: true, trim: true },
    text: { type: String, required: true, trim: true },
    showWhen: { type: String, enum: TIP_SHOW_WHEN, default: 'always' }, // 'period' = only while a period is logged
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: String, default: null, trim: true }, // who did the clinical review
    active: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// The admin service checks this too, but only the database can stop two simultaneous requests.
tipSchema.index({ category: 1, title: 1 }, { unique: true });

export default mongoose.model('Tip', tipSchema);
