import ApiError from '../utils/apiError.util.js';
import logger from '../utils/logger.util.js';
import env from '../config/env.config.js';

export const notFound = (req, res, next) =>
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));

// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, next) => {
  let { statusCode = 500, code = 'INTERNAL_ERROR', message = 'Something went wrong', details } = err;

  if (err.name === 'ValidationError' && err.errors) {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = 'Validation failed';
    details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
  } else if (err.name === 'CastError') {
    statusCode = 400;
    code = 'BAD_REQUEST';
    message = `Invalid ${err.path}`;
  } else if (err.code === 11000) {
    statusCode = 409;
    code = 'CONFLICT';
    message = 'Duplicate value';
  } else if (err.type === 'entity.parse.failed') {
    statusCode = 400;
    code = 'BAD_REQUEST';
    message = 'Invalid JSON body';
  } else if (err.type === 'entity.too.large') {
    statusCode = 413;
    code = 'PAYLOAD_TOO_LARGE';
    message = 'The request body is too large';
  }

  if (statusCode >= 500) {
    // Message and path only: never log the request body (may hold health data).
    logger.error(`${req.method} ${req.path} -> ${err.message}`, env.nodeEnv === 'production' ? undefined : { stack: err.stack });
    if (env.nodeEnv === 'production') message = 'Something went wrong';
  }

  res.status(statusCode).json({
    success: false,
    error: { code, message, ...(details && { details }) },
  });
};
