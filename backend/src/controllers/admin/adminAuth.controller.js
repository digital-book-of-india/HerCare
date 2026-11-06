import * as authService from '../../services/auth.service.js';
import { success } from '../../utils/response.util.js';
import logger from '../../utils/logger.util.js';

// The address is logged (never the typed email or password) so repeated failures can be traced and
// blocked. An IP address is not health data.
export const login = async (req, res) => {
  try {
    const result = await authService.adminLogin(req.body);
    logger.info(`security: admin logged in from ${req.ip}`);
    return success(res, result, 'Admin logged in');
  } catch (err) {
    if (err.statusCode === 401) logger.warn(`security: failed admin login from ${req.ip}`);
    throw err;
  }
};

export const me = (req, res) => success(res, { admin: req.admin });
