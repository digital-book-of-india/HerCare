import * as tips from '../../services/admin/adminTips.service.js';
import { success, created } from '../../utils/response.util.js';

export const list = async (req, res) => success(res, await tips.listTips(req.query));
export const get = async (req, res) => success(res, { tip: await tips.getTip(req.params.id) });
export const create = async (req, res) =>
  created(res, { tip: await tips.createTip(req.body) }, 'Tip created. It stays hidden until it is reviewed and activated');
export const update = async (req, res) => {
  const { tip, reviewReset } = await tips.updateTip(req.params.id, req.body);
  success(res, { tip, reviewReset }, reviewReset ? 'Tip updated. It was taken offline and needs a new review' : 'Tip updated');
};
export const review = async (req, res) =>
  success(res, { tip: await tips.reviewTip(req.params.id, req.body) }, 'Tip marked as reviewed');
export const setActive = async (req, res) =>
  success(res, { tip: await tips.setActive(req.params.id, req.body.active) }, req.body.active ? 'Tip activated' : 'Tip deactivated');
export const remove = async (req, res) => {
  await tips.deleteTip(req.params.id);
  success(res, null, 'Tip deleted');
};
