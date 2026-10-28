import SymptomLog from '../models/symptomLog.model.js';
import ApiError from '../utils/apiError.util.js';
import { assertNotTooFarAhead } from '../utils/dateGuards.util.js';

const alive = (userId) => ({ user: userId, deletedAt: null });

const hasContent = ({ symptoms, flow, mood, energy, note }) =>
  Boolean(symptoms?.length || flow || mood || energy || note);

// PUT semantics: the entry for that date is replaced as a whole, so a retry never duplicates it.
export const saveDay = async (userId, date, body) => {
  assertNotTooFarAhead(date);
  if (!hasContent(body)) {
    throw ApiError.badRequest('Add at least one symptom, flow, mood, energy level or note');
  }

  let log = await SymptomLog.findOne({ user: userId, date });
  const created = !log || log.deletedAt !== null;
  if (!log) log = new SymptomLog({ user: userId, date });

  log.symptoms = [...new Set(body.symptoms ?? [])];
  log.flow = body.flow ?? null;
  log.mood = body.mood ?? null;
  log.energy = body.energy ?? null;
  log.note = body.note ?? null;
  log.deletedAt = null;
  await log.save();

  return { log: log.toPublic(), created };
};

export const getDay = async (userId, date) => {
  const log = await SymptomLog.findOne({ ...alive(userId), date });
  if (!log) throw ApiError.notFound('No log for this date');
  return log.toPublic();
};

export const removeDay = async (userId, date) => {
  const log = await SymptomLog.findOne({ ...alive(userId), date });
  if (!log) throw ApiError.notFound('No log for this date');
  log.deletedAt = new Date();
  await log.save();
};

export const listDays = async (userId, { from, to, page = 1, limit = 31 }) => {
  const filter = {
    ...alive(userId),
    ...((from || to) && { date: { ...(from && { $gte: from }), ...(to && { $lte: to }) } }),
  };
  const [logs, total] = await Promise.all([
    SymptomLog.find(filter).sort({ date: -1 }).skip((page - 1) * limit).limit(limit),
    SymptomLog.countDocuments(filter),
  ]);
  return { items: logs.map((l) => l.toPublic()), page, limit, total };
};
