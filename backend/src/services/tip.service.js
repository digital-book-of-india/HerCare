import Tip from '../models/tip.model.js';
import { getEstimate } from './cycle.service.js';

const serialize = (tip) => ({
  id: tip._id,
  category: tip.category,
  title: tip.title,
  text: tip.text,
  // Activity tips are always optional: the person may skip them and rest today.
  ...(tip.category === 'activity' && { optional: true, canSkip: true }),
});

// Only active, reviewed tips. Tips marked `period` appear only while a period is logged:
// a plain rule on the user's own dates, not AI.
export const getTips = async (userId, { category }, today) => {
  const { inPeriod } = await getEstimate(userId, today);
  const tips = await Tip.find({
    active: true,
    reviewedAt: { $ne: null },
    showWhen: { $in: inPeriod ? ['always', 'period'] : ['always'] },
    ...(category && { category }),
  }).sort({ category: 1, title: 1 }).lean();
  return { inPeriod, tips: tips.map(serialize) };
};
