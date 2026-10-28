export default class ApiError extends Error {
  constructor(statusCode, code, message, details) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  static badRequest = (message, details) => new ApiError(400, 'BAD_REQUEST', message, details);
  static unauthorized = (message = 'Authentication required') => new ApiError(401, 'UNAUTHORIZED', message);
  static forbidden = (message = 'Access denied') => new ApiError(403, 'FORBIDDEN', message);
  static notFound = (message = 'Resource not found') => new ApiError(404, 'NOT_FOUND', message);
  static conflict = (message, details) => new ApiError(409, 'CONFLICT', message, details);
}
