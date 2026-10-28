// Pure sync rules (no DB, no clock): conflict resolution and per-record validation.
import { isValidDate, addDays, diffDays } from '../utils/dates.util.js';
import {
  SYMPTOMS, FLOWS, MOODS, ENERGY_LEVELS, REMINDER_TYPES, TIME_OF_DAY_RE,
} from '../utils/constants.util.js';

export const SYNC_ENTITIES = [
  'settings', 'periods', 'checklistItems', 'checklistLogs', 'symptoms', 'hydrationLogs', 'reminders',
];
// Entities whose records can be deleted (soft delete, so the deletion syncs to other devices).
export const SOFT_DELETE_ENTITIES = ['periods', 'symptoms', 'checklistItems'];

export const MAX_RECORDS_PER_ENTITY = 500;
export const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const MAX_PERIOD_DAYS = 20;

const OBJECT_ID_RE = /^[0-9a-f]{24}$/i;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T/;

export const isObjectId = (value) => typeof value === 'string' && OBJECT_ID_RE.test(value);

// An ISO date-time string -> Date, or null when it is not one.
export const parseTimestamp = (value) => {
  if (typeof value !== 'string' || !ISO_RE.test(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

// A device clock running ahead must not create a record nobody can ever overwrite.
export const clampTimestamp = (date, now) =>
  date.getTime() > now.getTime() + MAX_CLOCK_SKEW_MS ? now : date;

// Last-write-wins by the time of the user's edit.
//  create    : the server has no such record
//  update    : the incoming edit is newer
//  unchanged : same edit time, so this exact change was already applied (a retry)
//  stale     : the server's version is newer; the client must adopt it
export const decideLww = (existingTime, incomingTime) => {
  if (!existingTime) return 'create';
  const existing = existingTime.getTime();
  const incoming = incomingTime.getTime();
  if (incoming > existing) return 'update';
  return incoming === existing ? 'unchanged' : 'stale';
};

const isText = (value, max) => value == null || (typeof value === 'string' && value.length <= max);
const isInt = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const isTime = (value) => typeof value === 'string' && TIME_OF_DAY_RE.test(value);
const inList = (list) => (value) => list.includes(value);
const dateOk = (value, today) => isValidDate(value) && value <= addDays(today, 1);

// Which field(s) identify a record, and which are required when it is only being deleted.
const checkIdentity = (entity, rec, today) => {
  switch (entity) {
    case 'periods':
    case 'checklistItems':
      return isObjectId(rec.id) ? null : 'id must be a 24-character hex id';
    case 'symptoms':
      return dateOk(rec.date, today) ? null : 'date must be a real date (YYYY-MM-DD), not in the future';
    default:
      return null;
  }
};

const checkFields = (entity, rec, today) => {
  switch (entity) {
    case 'settings': {
      if (rec.cycleLength === undefined && rec.periodDuration === undefined) return 'Provide cycleLength or periodDuration';
      if (rec.cycleLength !== undefined && !isInt(rec.cycleLength, 15, 60)) return 'cycleLength must be 15-60';
      if (rec.periodDuration !== undefined && !isInt(rec.periodDuration, 1, 15)) return 'periodDuration must be 1-15';
      return null;
    }
    case 'periods': {
      if (!dateOk(rec.startDate, today)) return 'startDate must be a real date (YYYY-MM-DD), not in the future';
      if (rec.endDate != null) {
        if (!dateOk(rec.endDate, today)) return 'endDate must be a real date (YYYY-MM-DD), not in the future';
        if (rec.endDate < rec.startDate) return 'endDate cannot be before startDate';
        if (diffDays(rec.startDate, rec.endDate) + 1 > MAX_PERIOD_DAYS) return `A period cannot be longer than ${MAX_PERIOD_DAYS} days`;
      }
      return isText(rec.notes, 500) ? null : 'notes can be at most 500 characters';
    }
    case 'symptoms': {
      const { symptoms = [], flow = null, mood = null, energy = null, note = null } = rec;
      if (!Array.isArray(symptoms) || symptoms.length > SYMPTOMS.length || !symptoms.every(inList(SYMPTOMS))) return `symptoms can only be: ${SYMPTOMS.join(', ')}`;
      if (flow !== null && !FLOWS.includes(flow)) return `flow must be one of: ${FLOWS.join(', ')}`;
      if (mood !== null && !MOODS.includes(mood)) return `mood must be one of: ${MOODS.join(', ')}`;
      if (energy !== null && !ENERGY_LEVELS.includes(energy)) return `energy must be one of: ${ENERGY_LEVELS.join(', ')}`;
      if (!isText(note, 500)) return 'note can be at most 500 characters';
      return symptoms.length || flow || mood || energy || note ? null : 'Add at least one symptom, flow, mood, energy level or note';
    }
    case 'checklistItems': {
      if (typeof rec.label !== 'string' || !rec.label.trim() || rec.label.length > 80) return 'label must be 1-80 characters';
      return rec.order === undefined || isInt(rec.order, 0, 1000) ? null : 'order must be 0-1000';
    }
    case 'checklistLogs': {
      if (!dateOk(rec.date, today)) return 'date must be a real date (YYYY-MM-DD), not in the future';
      if (!isObjectId(rec.itemId)) return 'itemId must be a 24-character hex id';
      return typeof rec.completed === 'boolean' ? null : 'completed must be true or false';
    }
    case 'hydrationLogs': {
      if (!dateOk(rec.date, today)) return 'date must be a real date (YYYY-MM-DD), not in the future';
      if (!isTime(rec.time)) return 'time must be HH:MM (24-hour)';
      return typeof rec.done === 'boolean' ? null : 'done must be true or false';
    }
    case 'reminders': {
      if (!REMINDER_TYPES.includes(rec.type)) return `type must be one of: ${REMINDER_TYPES.join(', ')}`;
      if (rec.enabled !== undefined && typeof rec.enabled !== 'boolean') return 'enabled must be true or false';
      if (rec.paused !== undefined && typeof rec.paused !== 'boolean') return 'paused must be true or false';
      if (rec.snoozedUntil != null && !isValidDate(rec.snoozedUntil)) return 'snoozedUntil must be a real date (YYYY-MM-DD)';
      if (rec.leadDays !== undefined && (rec.type !== 'period' || !isInt(rec.leadDays, 0, 7))) return 'leadDays must be 0-7 and only applies to period reminders';
      if (rec.timeOfDay !== undefined && (rec.type === 'hydration' || !isTime(rec.timeOfDay))) return 'timeOfDay must be HH:MM and only applies to period and daily_log reminders';
      if (rec.times !== undefined && (rec.type !== 'hydration' || !Array.isArray(rec.times) || rec.times.length > 12 || !rec.times.every(isTime))) return 'times must be up to 12 HH:MM values and only apply to hydration reminders';
      return null;
    }
    default:
      return 'Unknown record type';
  }
};

// Returns null when the record is acceptable, otherwise a message. A record that only deletes
// something needs just its identity, so an app can send a tiny tombstone.
export const validateRecord = (entity, rec, today) => {
  if (rec === null || typeof rec !== 'object' || Array.isArray(rec)) return 'Record must be an object';
  if (rec.deleted !== undefined && typeof rec.deleted !== 'boolean') return 'deleted must be true or false';
  if (rec.deleted === true) {
    return SOFT_DELETE_ENTITIES.includes(entity) ? checkIdentity(entity, rec, today) : 'This record type cannot be deleted';
  }
  return checkIdentity(entity, rec, today) ?? checkFields(entity, rec, today);
};

// Do two periods overlap? The same meaning as the overlap query in period.service.js (which the REST
// endpoints use): a period with no end date counts as a single day. Used by sync to warn about
// duplicates from a list already in memory, instead of asking the database once per record.
export const rangesOverlap = (a, b) => {
  const aEnd = a.endDate ?? a.startDate;
  return b.startDate <= aEnd && (
    (b.endDate != null && b.endDate >= a.startDate) || (b.endDate == null && b.startDate >= a.startDate)
  );
};
