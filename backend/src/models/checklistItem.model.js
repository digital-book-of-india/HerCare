import mongoose from 'mongoose';
import syncPlugin from '../plugins/sync.plugin.js';
import { registerUserOwnedModel } from '../services/userData.service.js';

// A user's own checklist item. New users get a copy of the admin defaults on first use,
// and can then rename, add or remove items freely.
const checklistItemSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, required: true, index: true }, // DBI user id
    label: { type: String, required: true, trim: true, maxlength: 80 },
    order: { type: Number, default: 0 },
    defaultKey: { type: String, default: undefined }, // set on items copied from the admin defaults
    deletedAt: { type: Date, default: null }, // kept so past days still show the label
  },
  { timestamps: true }
);

// Makes the first-use copy safe even if two requests arrive at once.
checklistItemSchema.index(
  { user: 1, defaultKey: 1 },
  { unique: true, partialFilterExpression: { defaultKey: { $type: 'string' } } }
);

checklistItemSchema.methods.toPublic = function toPublic() {
  return { id: this._id, label: this.label, order: this.order };
};

checklistItemSchema.plugin(syncPlugin);

const ChecklistItem = mongoose.model('ChecklistItem', checklistItemSchema);
registerUserOwnedModel(ChecklistItem);

export default ChecklistItem;
