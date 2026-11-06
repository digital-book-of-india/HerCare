// Adds what every synced collection needs.
//  - `updatedAt` (Mongoose timestamps) is SERVER time. It drives the pull cursor, so a device
//    with a wrong clock can never make another device miss a change.
//  - `clientUpdatedAt` is when the user last edited the record. It decides last-write-wins.
// Edits made through the normal REST endpoints stamp it automatically; the sync service sets it
// from the device and flags the document with `$locals.syncing` so it is not overwritten.
export default function syncPlugin(schema) {
  schema.add({ clientUpdatedAt: { type: Date, default: Date.now } });

  // The sync pull asks "everything of this user changed since T", for every collection.
  schema.index({ user: 1, updatedAt: 1 });

  schema.pre('save', function stampEdit() {
    if (!this.isNew && !this.$locals.syncing && this.isModified()) this.clientUpdatedAt = new Date();
  });
}
