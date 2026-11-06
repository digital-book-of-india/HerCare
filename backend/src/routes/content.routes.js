import { Router } from 'express';
import { getContent } from '../controllers/daily.controller.js';

const router = Router();

// Public on purpose: the disclaimer and privacy text are shown before anyone logs in.
// It contains no user data.
router.get('/', getContent);

export default router;
