// Reads the `erasure: user=<id> at=<iso>` lines the server writes whenever a user erases their data.
const LINE = /erasure: user=([0-9a-f]{24}) at=(\d{4}-\d{2}-\d{2}T[0-9:.]+Z)/gi;

// Every erasure found in a log text, oldest first, newest erasure per user only.
export const parseErasureLog = (text) => {
  const latest = new Map();
  for (const [, userId, at] of String(text).matchAll(LINE)) {
    const when = new Date(at);
    if (Number.isNaN(when.getTime())) continue;
    const id = userId.toLowerCase();
    if (!latest.has(id) || when > latest.get(id)) latest.set(id, when);
  }
  return [...latest.entries()]
    .map(([userId, at]) => ({ userId, at }))
    .sort((a, b) => a.at - b.at);
};

// After restoring a backup made at `backupTime`, only erasures AFTER it need to be repeated:
// an earlier erasure is already part of the backup, and repeating it would delete the new data
// the user created since.
export const erasuresToReapply = (entries, backupTime) => entries.filter((entry) => entry.at > backupTime);
