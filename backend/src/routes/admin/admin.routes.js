import { Router } from 'express';
import * as authController from '../../controllers/admin/adminAuth.controller.js';
import * as dashboard from '../../controllers/admin/adminDashboard.controller.js';
import * as tips from '../../controllers/admin/adminTips.controller.js';
import * as settings from '../../controllers/admin/adminSettings.controller.js';
import { authenticateAdmin } from '../../middlewares/auth.middleware.js';
import { authLimiter } from '../../middlewares/rateLimiter.middleware.js';
import validate from '../../middlewares/validate.middleware.js';
import { loginRules } from '../../validators/auth.validator.js';
import {
  createTipRules, updateTipRules, reviewTipRules, setActiveRules, tipIdRules, listTipRules,
  updateContentRules, updateSettingsRules,
} from '../../validators/admin.validator.js';

const router = Router();

// Public: admin login (predefined email and password from .env)
router.post('/auth/login', authLimiter, loginRules, validate, authController.login);

// Everything below needs an admin token.
//
// PRIVACY RULE: the admin manages content and settings and sees aggregate numbers only. There is
// deliberately no route that returns a user's periods, symptoms, notes, reminders or checklist.
// tests/adminAccess.routes.test.js fails if a route is added here without being allow-listed.
router.use(authenticateAdmin);
router.get('/me', authController.me);

// 1. Dashboard (aggregates only)
router.get('/dashboard', dashboard.stats);

// 2. Tips: write, review, then activate
router.get('/tips', listTipRules, validate, tips.list);
router.post('/tips', createTipRules, validate, tips.create);
router.get('/tips/:id', tipIdRules, validate, tips.get);
router.patch('/tips/:id', updateTipRules, validate, tips.update);
router.post('/tips/:id/review', reviewTipRules, validate, tips.review);
router.patch('/tips/:id/active', setActiveRules, validate, tips.setActive);
router.delete('/tips/:id', tipIdRules, validate, tips.remove);

// 3. Default content: disclaimer, privacy text, default checklist
router.get('/content', settings.getContent);
router.patch('/content', updateContentRules, validate, settings.updateContent);

// 4. Feature switch and default cycle settings
router.get('/settings', settings.getSettings);
router.patch('/settings', updateSettingsRules, validate, settings.updateSettings);

export default router;
