import * as cycleService from '../services/cycle.service.js';
import { success } from '../utils/response.util.js';
import { todayUTC } from '../utils/dates.util.js';

export const estimate = async (req, res) =>
  success(res, { estimate: await cycleService.getEstimate(req.user.id, todayUTC()) });

export const calendar = async (req, res) =>
  success(res, await cycleService.getCalendar(req.user.id, req.query.month, todayUTC()));
