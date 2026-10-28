import * as syncService from '../services/sync.service.js';
import * as dataControl from '../services/dataControl.service.js';
import { success } from '../utils/response.util.js';
import { todayUTC } from '../utils/dates.util.js';

export const sync = async (req, res) =>
  success(res, await syncService.sync(req.user.id, {
    since: req.body.since ? new Date(req.body.since) : null,
    limit: req.body.limit,
    epoch: req.body.epoch,
    changes: req.body.changes ?? {},
  }));

export const exportData = async (req, res) => {
  res.setHeader('Content-Disposition', `attachment; filename="hercare-export-${todayUTC()}.json"`);
  success(res, await dataControl.exportAll(req.user.id), 'Your data');
};

export const eraseData = async (req, res) =>
  success(res, await dataControl.eraseAll(req.user.id), 'All your HerCare data was deleted');
