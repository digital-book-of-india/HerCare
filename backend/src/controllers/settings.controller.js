import * as settingsService from '../services/settings.service.js';
import { success } from '../utils/response.util.js';

export const get = async (req, res) =>
  success(res, { settings: await settingsService.getSettings(req.user.id) });

export const update = async (req, res) => {
  const { cycleLength, periodDuration } = req.body;
  const patch = { ...(cycleLength !== undefined && { cycleLength }), ...(periodDuration !== undefined && { periodDuration }) };
  success(res, { settings: await settingsService.updateSettings(req.user.id, patch) }, 'Settings saved');
};
