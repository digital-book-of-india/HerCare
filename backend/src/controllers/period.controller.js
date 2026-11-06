import * as periodService from '../services/period.service.js';
import { success, created } from '../utils/response.util.js';
import { todayUTC } from '../utils/dates.util.js';

export const create = async (req, res) =>
  created(res, { period: await periodService.createPeriod(req.user.id, req.body, todayUTC()) }, 'Period saved');

export const list = async (req, res) =>
  success(res, await periodService.listPeriods(req.user.id, req.query));

export const get = async (req, res) =>
  success(res, { period: await periodService.getPeriod(req.user.id, req.params.id) });

export const update = async (req, res) =>
  success(res, { period: await periodService.updatePeriod(req.user.id, req.params.id, req.body, todayUTC()) }, 'Period updated');

export const remove = async (req, res) => {
  await periodService.deletePeriod(req.user.id, req.params.id);
  success(res, null, 'Period deleted');
};
