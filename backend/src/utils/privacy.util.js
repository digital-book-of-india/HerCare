// Admin dashboards show aggregates only. A tiny number can still point at one person
// ("1 user logged a symptom today"), so counts below this size are hidden.
export const MIN_GROUP_SIZE = 5;
export const SMALL_COUNT_LABEL = `<${MIN_GROUP_SIZE}`;

// 0 and counts of at least MIN_GROUP_SIZE are shown as they are; 1 to MIN_GROUP_SIZE-1 become '<5'.
export const suppressSmallCount = (count) =>
  count > 0 && count < MIN_GROUP_SIZE ? SMALL_COUNT_LABEL : count;
