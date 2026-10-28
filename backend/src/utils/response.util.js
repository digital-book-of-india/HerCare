export const success = (res, data = null, message = 'OK', statusCode = 200) =>
  res.status(statusCode).json({ success: true, message, data });

export const created = (res, data = null, message = 'Created') => success(res, data, message, 201);
