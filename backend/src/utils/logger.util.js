// Health data and personal details must never reach the logs. Log messages and ids only, never
// request bodies. As a second line of defence, anything passed as `meta` is scrubbed here.
const REDACTED_KEYS = new Set([
  // credentials
  'password', 'passwordHash', 'token', 'authorization', 'cookie', 'secret', 'identifier',
  // personal details
  'email', 'phone',
  // health data and user-written text
  'notes', 'note', 'symptoms', 'mood', 'flow', 'energy', 'startDate', 'endDate',
  'date', 'time', 'times', 'label', 'text',
]);

export const redact = (value) => {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, REDACTED_KEYS.has(k) ? '[REDACTED]' : redact(v)])
    );
  }
  return value;
};

const write = (level, message, meta) => {
  const line = `[${new Date().toISOString()}] ${level.toUpperCase()} ${message}`;
  if (meta === undefined) console[level](line);
  else console[level](line, JSON.stringify(redact(meta)));
};

const logger = {
  info: (message, meta) => write('info', message, meta),
  warn: (message, meta) => write('warn', message, meta),
  error: (message, meta) => write('error', message, meta),
};

export default logger;
