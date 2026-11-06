import { body } from 'express-validator';

export const loginRules = [
  body('identifier').isString().trim().notEmpty().withMessage('Email is required'),
  body('password').isString().notEmpty().withMessage('Password is required'),
];
