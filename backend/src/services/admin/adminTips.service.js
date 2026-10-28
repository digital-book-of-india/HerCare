import Tip from '../../models/tip.model.js';
import ApiError from '../../utils/apiError.util.js';
import logger from '../../utils/logger.util.js';
import { addDays, todayUTC } from '../../utils/dates.util.js';

const CONTENT_FIELDS = ['category', 'title', 'text', 'showWhen'];

const toAdminTip = (tip) => ({
  id: tip._id,
  category: tip.category,
  title: tip.title,
  text: tip.text,
  showWhen: tip.showWhen,
  active: tip.active,
  reviewedAt: tip.reviewedAt,
  reviewedBy: tip.reviewedBy,
  createdAt: tip.createdAt,
  updatedAt: tip.updatedAt,
});

const findTip = async (id) => {
  const tip = await Tip.findById(id);
  if (!tip) throw ApiError.notFound('Tip not found');
  return tip;
};

const assertTitleFree = async (category, title, exceptId) => {
  const clash = await Tip.exists({ category, title, ...(exceptId && { _id: { $ne: exceptId } }) });
  if (clash) throw ApiError.conflict('A tip with this title already exists in this category');
};

export const listTips = async ({ category, active, reviewed, page = 1, limit = 50 }) => {
  const filter = {
    ...(category && { category }),
    ...(active !== undefined && { active }),
    ...(reviewed !== undefined && { reviewedAt: reviewed ? { $ne: null } : null }),
  };
  const [tips, total] = await Promise.all([
    Tip.find(filter).sort({ category: 1, title: 1 }).skip((page - 1) * limit).limit(limit),
    Tip.countDocuments(filter),
  ]);
  return { items: tips.map(toAdminTip), page, limit, total };
};

export const getTip = async (id) => toAdminTip(await findTip(id));

// New tips start inactive and unreviewed: nothing reaches users until it is reviewed.
export const createTip = async (body) => {
  await assertTitleFree(body.category, body.title);
  // Only the four wording fields are taken from the request; everything else starts at its safe default.
  const { category, title, text, showWhen } = body;
  const tip = await Tip.create({ category, title, text, showWhen, active: false, reviewedAt: null, reviewedBy: null });
  logger.info(`admin: tip created ${tip._id}`);
  return toAdminTip(tip);
};

// Changing the wording of a reviewed tip invalidates its review, so it goes offline until it is
// reviewed again. This keeps unreviewed text from ever being shown to users.
export const updateTip = async (id, patch) => {
  const tip = await findTip(id);
  const changed = CONTENT_FIELDS.filter((field) => patch[field] !== undefined && patch[field] !== tip[field]);

  const category = patch.category ?? tip.category;
  const title = patch.title ?? tip.title;
  if (changed.includes('category') || changed.includes('title')) await assertTitleFree(category, title, tip._id);

  changed.forEach((field) => { tip[field] = patch[field]; });
  const reviewReset = changed.length > 0 && Boolean(tip.reviewedAt || tip.active);
  if (reviewReset) {
    tip.reviewedAt = null;
    tip.reviewedBy = null;
    tip.active = false;
  }
  await tip.save();
  logger.info(`admin: tip updated ${tip._id}${reviewReset ? ' (review reset)' : ''}`);
  return { tip: toAdminTip(tip), reviewReset };
};

export const reviewTip = async (id, { reviewedAt, reviewedBy }) => {
  const tip = await findTip(id);
  const date = reviewedAt ?? todayUTC();
  if (date > addDays(todayUTC(), 1)) throw ApiError.badRequest('reviewedAt cannot be in the future');
  tip.reviewedAt = new Date(`${date}T00:00:00.000Z`);
  tip.reviewedBy = reviewedBy ?? null;
  await tip.save();
  logger.info(`admin: tip reviewed ${tip._id}`);
  return toAdminTip(tip);
};

export const setActive = async (id, active) => {
  const tip = await findTip(id);
  if (active && !tip.reviewedAt) {
    throw new ApiError(409, 'TIP_NOT_REVIEWED', 'A tip must be reviewed before it can be activated');
  }
  tip.active = active;
  await tip.save();
  logger.info(`admin: tip ${active ? 'activated' : 'deactivated'} ${tip._id}`);
  return toAdminTip(tip);
};

export const deleteTip = async (id) => {
  const tip = await findTip(id);
  await tip.deleteOne();
  logger.info(`admin: tip deleted ${id}`);
};
