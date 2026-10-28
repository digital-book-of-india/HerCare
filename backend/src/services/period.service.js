import PeriodRecord from '../models/periodRecord.model.js';
import ApiError from '../utils/apiError.util.js';
import { addDays, diffDays } from '../utils/dates.util.js';

const MAX_PERIOD_DAYS = 20;

const alive = (userId) => ({ user: userId, deletedAt: null });

const brief = (record) => ({ id: record._id, startDate: record.startDate, endDate: record.endDate });

// Dates may be at most one day ahead of the server's UTC date, which covers every time zone.
const validateRange = (startDate, endDate, today) => {
  const latest = addDays(today, 1);
  if (startDate > latest) throw ApiError.badRequest('startDate cannot be in the future');
  if (endDate) {
    if (endDate < startDate) throw ApiError.badRequest('endDate cannot be before startDate');
    if (endDate > latest) throw ApiError.badRequest('endDate cannot be in the future');
    if (diffDays(startDate, endDate) + 1 > MAX_PERIOD_DAYS) {
      throw ApiError.badRequest(`A period cannot be longer than ${MAX_PERIOD_DAYS} days`);
    }
  }
};

// A record without an end date counts as a single day when checking for overlaps.
export const findOverlaps = (userId, startDate, endDate, excludeId) =>
  PeriodRecord.find({
    ...alive(userId),
    ...(excludeId && { _id: { $ne: excludeId } }),
    startDate: { $lte: endDate ?? startDate },
    $or: [{ endDate: { $gte: startDate } }, { endDate: null, startDate: { $gte: startDate } }],
  }).lean();

// The same start date can never be saved twice (edit the existing record instead).
// An overlap needs the client to resend with confirmOverlap = true.
const assertNoConflict = async (userId, { startDate, endDate, confirmOverlap, excludeId }) => {
  const overlaps = await findOverlaps(userId, startDate, endDate, excludeId);
  if (overlaps.some((r) => r.startDate === startDate)) {
    throw new ApiError(409, 'DUPLICATE_PERIOD', 'A period starting on this date already exists', {
      existing: overlaps.filter((r) => r.startDate === startDate).map(brief),
    });
  }
  if (overlaps.length && !confirmOverlap) {
    throw new ApiError(409, 'OVERLAPPING_PERIOD', 'This period overlaps an existing one. Confirm to save it anyway', {
      requiresConfirmation: true,
      overlapping: overlaps.map(brief),
    });
  }
};

const findOwned = async (userId, id) => {
  const record = await PeriodRecord.findOne({ _id: id, ...alive(userId) });
  if (!record) throw ApiError.notFound('Period not found');
  return record;
};

export const createPeriod = async (userId, body, today) => {
  const { startDate, endDate = null, notes, confirmOverlap = false } = body;
  validateRange(startDate, endDate, today);
  await assertNoConflict(userId, { startDate, endDate, confirmOverlap });
  const record = await PeriodRecord.create({ user: userId, startDate, endDate, notes });

  // Two requests can pass the duplicate check at the same instant (a double tap on "Save"). Both then
  // insert, so look again: the one with the lower id keeps the period and the other withdraws. Each
  // side reaches the same answer, so exactly one survives, even across several server instances.
  const rival = await PeriodRecord.findOne({ ...alive(userId), startDate, _id: { $ne: record._id } })
    .sort({ _id: 1 }).select('_id').lean();
  if (rival && String(rival._id) < String(record._id)) {
    record.deletedAt = new Date(); // a deletion marker, not a removal, in case a phone already saw it
    await record.save();
    throw new ApiError(409, 'DUPLICATE_PERIOD', 'A period starting on this date already exists', { existing: [{ id: rival._id, startDate }] });
  }
  return record.toPublic();
};

// Edits only the targeted record; every other record is left as it was.
export const updatePeriod = async (userId, id, body, today) => {
  const record = await findOwned(userId, id);
  const startDate = body.startDate ?? record.startDate;
  const endDate = body.endDate === undefined ? record.endDate : body.endDate;
  validateRange(startDate, endDate, today);
  await assertNoConflict(userId, { startDate, endDate, confirmOverlap: body.confirmOverlap, excludeId: record._id });

  record.startDate = startDate;
  record.endDate = endDate;
  if (body.notes !== undefined) record.notes = body.notes;
  await record.save();
  return record.toPublic();
};

export const getPeriod = async (userId, id) => (await findOwned(userId, id)).toPublic();

export const deletePeriod = async (userId, id) => {
  const record = await findOwned(userId, id);
  record.deletedAt = new Date();
  await record.save();
};

export const listPeriods = async (userId, { from, to, page = 1, limit = 50 }) => {
  const filter = {
    ...alive(userId),
    ...((from || to) && { startDate: { ...(from && { $gte: from }), ...(to && { $lte: to }) } }),
  };
  const [records, total] = await Promise.all([
    PeriodRecord.find(filter).sort({ startDate: -1 }).skip((page - 1) * limit).limit(limit),
    PeriodRecord.countDocuments(filter),
  ]);
  return { items: records.map((r) => r.toPublic()), page, limit, total };
};

// Plain { startDate, endDate } of every actual period, for the estimator. Notes are not read.
export const actualPeriods = (userId) =>
  PeriodRecord.find(alive(userId)).select('startDate endDate -_id').sort({ startDate: 1 }).lean();
