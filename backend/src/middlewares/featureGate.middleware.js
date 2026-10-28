import ApiError from '../utils/apiError.util.js';
import { isFeatureEnabled } from '../services/admin/adminSettings.service.js';

// The admin's on/off switch for the whole HerCare feature. Placed after the routes that must
// always work (data export and erase), so a user can still get their data out.
export const requireFeatureEnabled = async (_req, _res, next) => {
  if (!(await isFeatureEnabled())) {
    throw new ApiError(503, 'FEATURE_DISABLED', 'HerCare is temporarily unavailable');
  }
  next();
};
