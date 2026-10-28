import * as adminSettings from '../../services/admin/adminSettings.service.js';
import { success } from '../../utils/response.util.js';

export const getSettings = async (_req, res) =>
  success(res, { settings: await adminSettings.getSettings() });
export const updateSettings = async (req, res) =>
  success(res, { settings: await adminSettings.updateSettings(req.body) }, 'Settings saved');

export const getContent = async (_req, res) =>
  success(res, { content: await adminSettings.getContent() });
export const updateContent = async (req, res) =>
  success(res, { content: await adminSettings.updateContent(req.body) }, 'Content saved. New users get the updated checklist');
