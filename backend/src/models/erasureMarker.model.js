import mongoose from 'mongoose';

// Written when a user erases all their data. It holds only a timestamp (no health data) so that
// another device still holding old data cannot push it back and undo the erasure.
// Not registered as user-owned data on purpose: it must survive the erase it records.
const erasureMarkerSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true }, // DBI user id
  erasedAt: { type: Date, required: true },
});

// A device offline for over a year is treated as a new install.
erasureMarkerSchema.index({ erasedAt: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 });

export default mongoose.model('ErasureMarker', erasureMarkerSchema);
