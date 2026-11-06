import { getDashboard } from '../../services/admin/adminDashboard.service.js';
import { success } from '../../utils/response.util.js';

export const stats = async (_req, res) => success(res, await getDashboard());
