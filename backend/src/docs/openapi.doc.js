// The API reference, as an OpenAPI 3.0 document. `npm run docs:build` writes it to docs/api/openapi.json
// (importable into Swagger UI, Postman, code generators). Tests fail if it ever disagrees with the
// real routes, and a live suite sends its examples to the server, so it cannot quietly go stale.
//
// Every success response uses the same envelope:  { success: true, message, data }
// Every error response uses the same envelope:    { success: false, error: { code, message, details? } }

// ---------------------------------------------------------------- tiny builders
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const str = (extra = {}) => ({ type: 'string', ...extra });
const int = (extra = {}) => ({ type: 'integer', ...extra });
const bool = (extra = {}) => ({ type: 'boolean', ...extra });
const list = (items) => ({ type: 'array', items });
const nullable = (schema) => ({ ...schema, nullable: true });
const obj = (properties, required = Object.keys(properties), extra = {}) => ({ type: 'object', properties, required, ...extra });
const date = (example = '2026-09-01', description = 'A calendar date, YYYY-MM-DD') =>
  str({ pattern: '^\\d{4}-\\d{2}-\\d{2}$', example, description });
const isoTime = (example = '2026-10-28T09:30:00.000Z') => str({ format: 'date-time', example });
const hhmm = (example = '10:00') => str({ pattern: '^([01]\\d|2[0-3]):[0-5]\\d$', example, description: '24-hour time of day, HH:MM, in the user\'s local time' });
const objectId = (example = '65f1c2a4b8e9d3a7c1f20e11') => str({ pattern: '^[0-9a-f]{24}$', example });

const envelope = (data) => obj({ success: bool({ example: true }), message: str({ example: 'OK' }), data });
const json = (schema, example) => ({ 'application/json': { schema, ...(example === undefined ? {} : { example }) } });

const param = (name, where, schema, description, required = where === 'path') => ({ name, in: where, required, description, schema });
const P = {
  id: param('id', 'path', objectId(), 'The record id'),
  itemId: param('itemId', 'path', objectId(), 'The checklist item id'),
  date: param('date', 'path', date(), 'The day, YYYY-MM-DD'),
  time: param('time', 'path', hhmm(), 'One of the user\'s hydration reminder times, HH:MM'),
  type: param('type', 'path', str({ enum: ['period', 'daily_log', 'hydration'] }), 'The reminder type'),
  localDate: param('date', 'query', date(), 'The phone\'s local date. Defaults to the server\'s UTC date. Send it so "today" is right in every time zone.'),
  from: param('from', 'query', date(), 'First day (inclusive)'),
  to: param('to', 'query', date(), 'Last day (inclusive)'),
  page: param('page', 'query', int({ minimum: 1, default: 1 }), 'Page number'),
  month: param('month', 'query', str({ pattern: '^\\d{4}-(0[1-9]|1[0-2])$', example: '2026-10' }), 'The month, YYYY-MM', true),
};
const limit = (max, def) => param('limit', 'query', int({ minimum: 1, maximum: max, default: def }), `Page size, 1 to ${max}`);
const requiredQuery = (parameter) => ({ ...parameter, required: true });

const errorRefs = (...codes) => Object.fromEntries(codes.map((code) => [String(code), { $ref: `#/components/responses/Error${code}` }]));

// ---------------------------------------------------------------- schemas
const schemas = {
  Error: obj({
    success: bool({ example: false }),
    error: obj({
      code: str({ example: 'BAD_REQUEST', description: 'A stable machine-readable code. See the error table in docs/mobile-integration-guide.md.' }),
      message: str({ example: 'Validation failed' }),
      details: { description: 'Present on validation errors: a list of { field, message }. Some conflicts add an object.', oneOf: [list(obj({ field: str(), message: str() })), { type: 'object' }] },
    }, ['code', 'message']),
  }),

  Period: obj({
    id: objectId(), startDate: date(), endDate: nullable(date('2026-09-05')),
    durationDays: nullable(int({ example: 5, description: 'Days from start to end inclusive; null while no end date is set' })),
    source: str({ enum: ['actual'], description: 'Always "actual": predictions are never stored' }),
    notes: nullable(str({ maxLength: 500 })), createdAt: isoTime(), updatedAt: isoTime(),
  }),
  PeriodInput: obj({
    startDate: date(), endDate: nullable(date('2026-09-05')), notes: nullable(str({ maxLength: 500 })),
    confirmOverlap: bool({ description: 'Send true after the user confirms a 409 OVERLAPPING_PERIOD warning' }),
  }, ['startDate']),
  Estimate: obj({
    status: str({ enum: ['no_data', 'upcoming', 'overdue'] }),
    estimated: bool({ example: true, description: 'Always true. Show it as an estimate.' }),
    basis: str({ enum: ['none', 'chosen_length', 'recorded_cycles'], description: 'Where the cycle length came from' }),
    tooLittleHistory: bool({ description: 'True until two usable cycles are recorded' }),
    intervalsUsed: int({ example: 3 }), cycleLength: int({ example: 28 }), periodDuration: int({ example: 5 }),
    lastPeriodStart: nullable(date()), nextEstimatedStart: nullable(date('2026-09-29')), nextEstimatedEnd: nullable(date('2026-10-03')),
    daysUntilNextPeriod: nullable(int({ description: 'Negative when overdue' })), overdueDays: int({ minimum: 0 }),
    cycleDay: nullable(int({ description: 'Day 1 is the first day of the last period' })), inPeriod: bool(),
  }),
  CalendarDay: obj({ date: date(), type: str({ enum: ['actual', 'predicted'], description: '"predicted" days are estimates; actual days always win' }) }),

  SymptomLog: obj({
    id: objectId(), date: date(),
    symptoms: list(str({ enum: ['cramps', 'headache', 'bloating', 'fatigue', 'nausea', 'back_pain', 'breast_tenderness', 'acne'] })),
    flow: nullable(str({ enum: ['light', 'medium', 'heavy'] })), mood: nullable(str({ enum: ['happy', 'calm', 'neutral', 'sad', 'anxious', 'irritable'] })),
    energy: nullable(str({ enum: ['low', 'medium', 'high'] })), note: nullable(str({ maxLength: 500 })), createdAt: isoTime(), updatedAt: isoTime(),
  }),
  SymptomInput: obj({
    symptoms: list(str({ enum: ['cramps', 'headache', 'bloating', 'fatigue', 'nausea', 'back_pain', 'breast_tenderness', 'acne'] })),
    flow: nullable(str({ enum: ['light', 'medium', 'heavy'] })), mood: nullable(str({ enum: ['happy', 'calm', 'neutral', 'sad', 'anxious', 'irritable'] })),
    energy: nullable(str({ enum: ['low', 'medium', 'high'] })), note: nullable(str({ maxLength: 500 })),
  }, [], { description: 'Replaces the whole entry for that date. At least one field must be filled.' }),

  ChecklistItem: obj({ id: objectId(), label: str({ example: 'Take a rest break' }), order: int({ example: 0 }) }),
  ChecklistDayItem: obj({ id: objectId(), label: str(), completed: bool() }),
  ChecklistDay: obj({
    date: date(), items: list(ref('ChecklistDayItem')), progress: obj({ done: int({ example: 1 }), total: int({ example: 4 }) }),
  }),
  HydrationSlot: obj({ time: hhmm(), done: bool() }),

  Reminder: obj({
    type: str({ enum: ['period', 'daily_log', 'hydration'] }), enabled: bool(), paused: bool(),
    snoozedUntil: nullable(date('2026-10-29')), status: str({ enum: ['disabled', 'paused', 'snoozed', 'active'] }),
    leadDays: int({ minimum: 0, maximum: 7, description: 'Period reminders only' }),
    timeOfDay: hhmm('09:00'), times: list(hhmm()),
  }, ['type', 'enabled', 'paused', 'snoozedUntil', 'status'], { description: 'Only the fields that apply to the type are present: period has leadDays and timeOfDay, daily_log has timeOfDay, hydration has times.' }),
  Notification: obj({
    type: str({ enum: ['period', 'daily_log', 'hydration'] }), date: date('2026-10-29'), time: hhmm('09:00'),
    text: str({ example: 'Your period is estimated to start in 2 days.' }),
  }),

  UserTip: obj({
    id: objectId(), category: str({ enum: ['food', 'activity'] }), title: str({ example: 'Light walking' }), text: str(),
    optional: bool({ description: 'Activity tips only: always true' }), canSkip: bool({ description: 'Activity tips only: offer "rest today" instead' }),
  }, ['id', 'category', 'title', 'text']),

  Settings: obj({
    cycleLength: int({ minimum: 15, maximum: 60, example: 28 }), periodDuration: int({ minimum: 1, maximum: 15, example: 5 }),
    usingDefaults: bool({ description: 'True until the user saves their own values' }),
  }),

  // ---- sync
  SyncPeriod: obj({ id: objectId(), startDate: date(), endDate: nullable(date()), notes: nullable(str()), deleted: bool(), clientUpdatedAt: isoTime() }, ['id', 'clientUpdatedAt']),
  SyncSymptom: obj({
    date: date(), symptoms: list(str()), flow: nullable(str()), mood: nullable(str()), energy: nullable(str()), note: nullable(str()),
    deleted: bool(), clientUpdatedAt: isoTime(),
  }, ['date', 'clientUpdatedAt']),
  SyncChecklistItem: obj({ id: objectId(), label: str(), order: int(), deleted: bool(), clientUpdatedAt: isoTime() }, ['id', 'clientUpdatedAt']),
  SyncChecklistLog: obj({ date: date(), itemId: objectId(), completed: bool(), clientUpdatedAt: isoTime() }),
  SyncHydrationLog: obj({ date: date(), time: hhmm(), done: bool(), clientUpdatedAt: isoTime() }),
  SyncReminder: obj({
    type: str({ enum: ['period', 'daily_log', 'hydration'] }), enabled: bool(), paused: bool(), snoozedUntil: nullable(date()),
    leadDays: int(), timeOfDay: hhmm(), times: list(hhmm()), clientUpdatedAt: isoTime(),
  }, ['type', 'clientUpdatedAt']),
  SyncSettings: obj({ cycleLength: int(), periodDuration: int(), clientUpdatedAt: isoTime() }, ['clientUpdatedAt']),
  SyncChanges: obj({
    settings: ref('SyncSettings'), periods: list(ref('SyncPeriod')), checklistItems: list(ref('SyncChecklistItem')),
    checklistLogs: list(ref('SyncChecklistLog')), symptoms: list(ref('SyncSymptom')), hydrationLogs: list(ref('SyncHydrationLog')),
    reminders: list(ref('SyncReminder')),
  }, [], { description: 'At most 500 records per list per request. Unknown keys are ignored.' }),
  SyncRequest: obj({
    since: nullable(isoTime()), epoch: nullable(str({ maxLength: 64 })), limit: int({ minimum: 1, maximum: 2000, default: 1000 }),
    changes: ref('SyncChanges'),
  }, [], { description: 'Everything is optional. An empty body just pulls.' }),
  SyncRejection: obj({
    entity: str({ example: 'periods' }), key: str({ example: '65f1c2a4b8e9d3a7c1f20e11' }),
    reason: str({ enum: ['invalid', 'stale', 'conflict', 'erased'] }), message: str(),
    server: { type: 'object', description: 'On "stale": the server\'s newer version, which the phone must adopt' },
  }, ['entity', 'key', 'reason', 'message']),
  SyncResponse: obj({
    serverTime: isoTime(), cursor: isoTime(), hasMore: bool({ description: 'Call again with the new cursor until false' }),
    epoch: str({ example: '1', description: 'Identifies this copy of the data. Store it and send it back.' }),
    resyncRequired: bool({ description: 'True when the epoch you sent is not the server\'s: reset your cursor and send ALL local data' }),
    erasedAt: isoTime(),
    push: obj({
      applied: { type: 'object', additionalProperties: int(), example: { periods: 2, symptoms: 1 } },
      unchanged: { type: 'object', additionalProperties: int() },
      rejected: list(ref('SyncRejection')),
      warnings: list(obj({ entity: str(), key: str(), reason: str({ enum: ['duplicate_start', 'overlap'] }), with: str() })),
    }),
    changes: { type: 'object', description: 'What changed on the server, same record shapes as the request, plus updatedAt (server time) and deleted flags' },
  }, ['serverTime', 'cursor', 'hasMore', 'epoch', 'resyncRequired', 'push', 'changes']),

  // ---- admin
  AdminTip: obj({
    id: objectId(), category: str({ enum: ['food', 'activity'] }), title: str(), text: str(),
    showWhen: str({ enum: ['always', 'period'] }), active: bool(), reviewedAt: nullable(isoTime()), reviewedBy: nullable(str()),
    createdAt: isoTime(), updatedAt: isoTime(),
  }),
  CountOrHidden: { description: 'A number, or the string "<5" when the real number is 1 to 4 (hidden to protect privacy)', oneOf: [int(), str({ enum: ['<5'] })] },
  Dashboard: obj({
    generatedAt: isoTime(), privacyNote: str(), feature: obj({ enabled: bool() }),
    users: obj({ total: ref('CountOrHidden'), activeLast7Days: ref('CountOrHidden'), activeLast30Days: ref('CountOrHidden') }),
    records: obj({ periods: ref('CountOrHidden'), symptomLogs: ref('CountOrHidden'), checklistItemsCompleted: ref('CountOrHidden'), hydrationRemindersDone: ref('CountOrHidden') }),
    activeReminders: obj({ period: ref('CountOrHidden'), daily_log: ref('CountOrHidden'), hydration: ref('CountOrHidden') }),
    tips: obj({ total: int(), active: int(), awaitingReview: int() }),
  }),
  AdminContent: obj({
    disclaimerText: str({ minLength: 20, maxLength: 2000 }), privacyText: str({ minLength: 20, maxLength: 4000 }),
    defaultChecklistItems: list(obj({ id: str({ pattern: '^[a-z0-9-]{1,40}$', example: 'rest-break' }), label: str({ maxLength: 80 }) })), updatedAt: isoTime(),
  }),
  AdminSettings: obj({
    featureEnabled: bool(), defaultCycleLength: int({ minimum: 15, maximum: 60 }), defaultPeriodDuration: int({ minimum: 1, maximum: 15 }), updatedAt: isoTime(),
  }),
};

const responses = {
  Error400: { description: 'The request is not valid. `details` lists each problem.', content: json(ref('Error'), { success: false, error: { code: 'BAD_REQUEST', message: 'Validation failed', details: [{ field: 'startDate', message: 'startDate must be a real date in YYYY-MM-DD format' }] } }) },
  Error401: { description: 'Missing, expired or invalid token', content: json(ref('Error'), { success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' } }) },
  Error403: { description: 'This kind of DBI account may not use HerCare (when the operators have restricted it)', content: json(ref('Error'), { success: false, error: { code: 'FORBIDDEN', message: 'This kind of account cannot use HerCare' } }) },
  Error404: { description: 'Not found, or not yours', content: json(ref('Error'), { success: false, error: { code: 'NOT_FOUND', message: 'Period not found' } }) },
  Error409: { description: 'A conflict. The code says which: DUPLICATE_PERIOD, OVERLAPPING_PERIOD, TIP_NOT_REVIEWED, CONFLICT.', content: json(ref('Error'), { success: false, error: { code: 'OVERLAPPING_PERIOD', message: 'This period overlaps an existing one. Confirm to save it anyway', details: { requiresConfirmation: true, overlapping: [] } } }) },
  Error413: { description: 'The body is too large (10 KB, or 2 MB for sync)', content: json(ref('Error'), { success: false, error: { code: 'PAYLOAD_TOO_LARGE', message: 'The request body is too large' } }) },
  Error429: { description: 'Too many requests. Wait and retry; see the RateLimit-* headers.', content: json(ref('Error'), { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests, slow down and try again shortly' } }) },
  Error503: { description: 'HerCare has been switched off by the admin (FEATURE_DISABLED). Data export and erase still work.', content: json(ref('Error'), { success: false, error: { code: 'FEATURE_DISABLED', message: 'HerCare is temporarily unavailable' } }) },
};

// ---------------------------------------------------------------- operations
const USER_ERRORS = [400, 401, 413, 429, 503];
// Every user operation can also answer 403: the operators may restrict which DBI account kinds can use HerCare.
const withForbidden = (auth, errors) => (auth === 'user' ? [...new Set([...errors, 403])] : errors);
const op = ({ id, tag, summary, description, auth = 'user', params = [], body, bodyExample, status = 200, ok, example, errors = [] }) => ({
  operationId: id,
  tags: [tag],
  summary,
  ...(description && { description }),
  security: auth === 'none' ? [] : [{ [auth === 'admin' ? 'adminToken' : 'userToken']: [] }],
  ...(params.length > 0 && { parameters: params }),
  ...(body && { requestBody: { required: true, content: json(body, bodyExample) } }),
  responses: {
    [status]: { description: ok.description, content: json(envelope(ok.schema), example === undefined ? undefined : { success: true, message: 'OK', data: example }) },
    ...errorRefs(...withForbidden(auth, errors)),
  },
});

const periodExample = { id: '65f1c2a4b8e9d3a7c1f20e11', startDate: '2026-09-01', endDate: '2026-09-05', durationDays: 5, source: 'actual', notes: null, createdAt: '2026-10-01T08:00:00.000Z', updatedAt: '2026-10-01T08:00:00.000Z' };
const estimateExample = {
  status: 'upcoming', estimated: true, basis: 'recorded_cycles', tooLittleHistory: false, intervalsUsed: 3, cycleLength: 28, periodDuration: 5,
  lastPeriodStart: '2026-10-01', nextEstimatedStart: '2026-10-29', nextEstimatedEnd: '2026-11-02', daysUntilNextPeriod: 1, overdueDays: 0, cycleDay: 28, inPeriod: false,
};
const symptomExample = { id: '65f1c2a4b8e9d3a7c1f20e12', date: '2026-10-27', symptoms: ['cramps'], flow: 'light', mood: 'calm', energy: 'low', note: null, createdAt: '2026-10-27T20:00:00.000Z', updatedAt: '2026-10-27T20:00:00.000Z' };
const adminTipExample = { id: '65f1c2a4b8e9d3a7c1f20e13', category: 'activity', title: 'Light walking', text: 'A gentle walk is optional. Rest today if you prefer.', showWhen: 'always', active: false, reviewedAt: null, reviewedBy: null, createdAt: '2026-10-28T08:00:00.000Z', updatedAt: '2026-10-28T08:00:00.000Z' };

const OPS = [
  ['get', '/health', op({
    id: 'health', tag: 'Health', auth: 'none', summary: 'Is the server (and its database) up?',
    description: 'Not rate limited. 200 when the database is reachable, 503 when it is not. Use it for load balancer checks.',
    ok: { description: 'Healthy', schema: obj({ status: str({ example: 'ok' }), db: str({ example: 'up' }) }) }, example: { status: 'ok', db: 'up' },
  })],
  ['get', '/content', op({
    id: 'getPublicContent', tag: 'Content', auth: 'none', summary: 'Disclaimer, privacy text and whether HerCare is switched on',
    description: 'Public: needed before anyone signs in (welcome and consent screen). Contains no user data.', errors: [429],
    ok: { description: 'The public texts', schema: obj({ featureEnabled: bool(), disclaimerText: str(), privacyText: str() }) },
    example: { featureEnabled: true, disclaimerText: 'HerCare is a wellness and tracking tool, not a medical diagnosis or contraception app. Cycle dates are estimates, not guarantees.', privacyText: 'Your data is yours. You can export or delete it at any time.' },
  })],

  // ---- account and data rights
  ['get', '/user/me', op({
    id: 'getMe', tag: 'Account', summary: 'Check that your DBI token is accepted', errors: [401, 429],
    ok: { description: 'Who HerCare thinks you are', schema: obj({ user: obj({ id: objectId(), role: str({ example: 'user' }) }) }) }, example: { user: { id: '65f1c2a4b8e9d3a7c1f20e11', role: 'user' } },
  })],
  ['get', '/user/export', op({
    id: 'exportData', tag: 'Account', summary: 'Download all of the user\'s data', errors: [401, 429],
    description: 'A versioned JSON backup in the same shape sync uses (notes decrypted, deleted records left out). Still works when HerCare is switched off.',
    ok: { description: 'The export', schema: obj({ version: int({ example: 1 }), exportedAt: isoTime(), note: str(), data: { type: 'object', description: 'settings, periods, checklistItems, checklistLogs, symptoms, hydrationLogs, reminders' } }) },
    example: {
      version: 1, exportedAt: '2026-10-28T09:30:00.000Z',
      note: 'Cycle dates are estimates, not guarantees. This file contains your private health data: keep it safe.',
      data: { settings: null, periods: [], checklistItems: [], checklistLogs: [], symptoms: [], hydrationLogs: [], reminders: [] },
    },
  })],
  ['delete', '/user/data', op({
    id: 'eraseData', tag: 'Account', summary: 'Permanently delete all of the user\'s HerCare data', errors: [400, 401, 429],
    description: 'Deletes every HerCare record of this user (the DBI account is not touched). Cannot be undone. After this, `sync` returns `erasedAt`: any phone that last synced before that must wipe its local copy. Still works when HerCare is switched off.',
    body: obj({ confirm: str({ enum: ['DELETE ALL MY DATA'] }) }), bodyExample: { confirm: 'DELETE ALL MY DATA' },
    ok: { description: 'Erased', schema: obj({ erasedAt: isoTime() }) }, example: { erasedAt: '2026-10-28T09:30:00.000Z' },
  })],

  // ---- settings
  ['get', '/user/settings', op({
    id: 'getSettings', tag: 'Settings', summary: 'Cycle length and period length', errors: [401, 429, 503],
    ok: { description: 'The user\'s values, or the admin\'s defaults until they save their own', schema: obj({ settings: ref('Settings') }) },
    example: { settings: { cycleLength: 28, periodDuration: 5, usingDefaults: true } },
  })],
  ['patch', '/user/settings', op({
    id: 'updateSettings', tag: 'Settings', summary: 'Save the user\'s cycle length and/or period length', errors: USER_ERRORS,
    body: obj({ cycleLength: int({ minimum: 15, maximum: 60 }), periodDuration: int({ minimum: 1, maximum: 15 }) }, [], { description: 'Send at least one.' }), bodyExample: { cycleLength: 30, periodDuration: 5 },
    ok: { description: 'Saved', schema: obj({ settings: ref('Settings') }) }, example: { settings: { cycleLength: 30, periodDuration: 5, usingDefaults: false } },
  })],

  // ---- periods
  ['get', '/user/periods', op({
    id: 'listPeriods', tag: 'Periods', summary: 'The period history, newest first', errors: [400, 401, 429, 503],
    params: [P.from, P.to, P.page, limit(200, 50)],
    ok: { description: 'A page of periods', schema: obj({ items: list(ref('Period')), page: int(), limit: int(), total: int() }) }, example: { items: [periodExample], page: 1, limit: 50, total: 1 },
  })],
  ['post', '/user/periods', op({
    id: 'createPeriod', tag: 'Periods', summary: 'Log a period', status: 201, errors: [...USER_ERRORS, 409],
    description: 'The same start date twice is refused (409 DUPLICATE_PERIOD, edit the existing one). An overlap is refused with 409 OVERLAPPING_PERIOD until the user confirms and you resend with `confirmOverlap: true`. A period can be at most 20 days; dates can be at most one day ahead of the server\'s UTC date.',
    body: ref('PeriodInput'), bodyExample: { startDate: '2026-09-01', endDate: '2026-09-05', notes: 'Felt tired on day 1' },
    ok: { description: 'Saved', schema: obj({ period: ref('Period') }) }, example: { period: periodExample },
  })],
  ['get', '/user/periods/{id}', op({
    id: 'getPeriod', tag: 'Periods', summary: 'One period', params: [P.id], errors: [400, 401, 404, 429, 503],
    ok: { description: 'The period', schema: obj({ period: ref('Period') }) }, example: { period: periodExample },
  })],
  ['patch', '/user/periods/{id}', op({
    id: 'updatePeriod', tag: 'Periods', summary: 'Edit a period', params: [P.id], errors: [...USER_ERRORS, 404, 409],
    description: 'Only this record changes. Send `endDate: null` to clear the end date. The same duplicate and overlap rules apply as when logging.',
    body: ref('PeriodInput'), bodyExample: { endDate: '2026-09-06' },
    ok: { description: 'Saved', schema: obj({ period: ref('Period') }) }, example: { period: { ...periodExample, endDate: '2026-09-06', durationDays: 6 } },
  })],
  ['delete', '/user/periods/{id}', op({
    id: 'deletePeriod', tag: 'Periods', summary: 'Delete a period', params: [P.id], errors: [400, 401, 404, 429, 503],
    ok: { description: 'Deleted (kept internally as a deletion marker so other phones learn about it)', schema: { nullable: true } }, example: null,
  })],

  // ---- cycle
  ['get', '/user/cycle/estimate', op({
    id: 'getEstimate', tag: 'Cycle', summary: 'The next-period estimate', errors: [400, 401, 429, 503], params: [P.localDate],
    description: 'Computed from the recorded periods by the rule in docs/estimate-rule.md. It is ALWAYS an estimate. A phone that works offline must implement the same rule; docs/estimate-test-vectors.json lets you check it.',
    ok: { description: 'The estimate', schema: obj({ estimate: ref('Estimate') }) }, example: { estimate: estimateExample },
  })],
  ['get', '/user/cycle/calendar', op({
    id: 'getCalendar', tag: 'Cycle', summary: 'One month, with logged days and estimated days', errors: [400, 401, 429, 503],
    params: [requiredQuery(P.month)],
    ok: { description: 'Days that are part of a period', schema: obj({ month: str({ example: '2026-10' }), days: list(ref('CalendarDay')), estimate: ref('Estimate') }) },
    example: { month: '2026-10', days: [{ date: '2026-10-01', type: 'actual' }, { date: '2026-10-29', type: 'predicted' }], estimate: estimateExample },
  })],

  // ---- symptoms
  ['get', '/user/symptoms', op({
    id: 'listSymptoms', tag: 'Symptoms', summary: 'Symptom and flow log, newest first', errors: [400, 401, 429, 503],
    params: [P.from, P.to, P.page, limit(100, 31)],
    ok: { description: 'A page of daily logs', schema: obj({ items: list(ref('SymptomLog')), page: int(), limit: int(), total: int() }) }, example: { items: [symptomExample], page: 1, limit: 31, total: 1 },
  })],
  ['put', '/user/symptoms/{date}', op({
    id: 'saveSymptoms', tag: 'Symptoms', summary: 'Save the log for a day (creates or replaces)', params: [P.date], status: 201, errors: USER_ERRORS,
    description: 'Replaces the whole entry for that date, so sending it twice is harmless. 201 the first time, 200 after. An empty entry is refused. Only the listed symptom names are accepted.',
    body: ref('SymptomInput'), bodyExample: { symptoms: ['cramps', 'headache'], flow: 'medium', mood: 'calm', energy: 'low', note: 'Rested in the evening' },
    ok: { description: 'Saved (201 created, 200 updated)', schema: obj({ log: ref('SymptomLog') }) }, example: { log: symptomExample },
  })],
  ['get', '/user/symptoms/{date}', op({
    id: 'getSymptoms', tag: 'Symptoms', summary: 'The log for one day', params: [P.date], errors: [400, 401, 404, 429, 503],
    ok: { description: 'The log', schema: obj({ log: ref('SymptomLog') }) }, example: { log: symptomExample },
  })],
  ['delete', '/user/symptoms/{date}', op({
    id: 'deleteSymptoms', tag: 'Symptoms', summary: 'Delete the log for one day', params: [P.date], errors: [400, 401, 404, 429, 503],
    ok: { description: 'Deleted', schema: { nullable: true } }, example: null,
  })],

  // ---- checklist
  ['get', '/user/checklist/items', op({
    id: 'listChecklistItems', tag: 'Checklist', summary: 'The user\'s own checklist items', errors: [401, 429, 503],
    description: 'On first use the user gets a copy of the admin\'s default items. After that the list is theirs to edit (max 30).',
    ok: { description: 'The items', schema: obj({ items: list(ref('ChecklistItem')) }) }, example: { items: [{ id: '65f1c2a4b8e9d3a7c1f20e21', label: 'Take a rest break', order: 0 }] },
  })],
  ['post', '/user/checklist/items', op({
    id: 'addChecklistItem', tag: 'Checklist', summary: 'Add a checklist item', status: 201, errors: USER_ERRORS,
    body: obj({ label: str({ minLength: 1, maxLength: 80 }) }), bodyExample: { label: 'Stretch for 5 minutes' },
    ok: { description: 'Added', schema: obj({ item: ref('ChecklistItem') }) }, example: { item: { id: '65f1c2a4b8e9d3a7c1f20e22', label: 'Stretch for 5 minutes', order: 4 } },
  })],
  ['patch', '/user/checklist/items/{itemId}', op({
    id: 'updateChecklistItem', tag: 'Checklist', summary: 'Rename or reorder an item', params: [P.itemId], errors: [...USER_ERRORS, 404],
    body: obj({ label: str({ maxLength: 80 }), order: int({ minimum: 0, maximum: 1000 }) }, [], { description: 'Send at least one.' }), bodyExample: { label: 'Light stretching' },
    ok: { description: 'Saved', schema: obj({ item: ref('ChecklistItem') }) }, example: { item: { id: '65f1c2a4b8e9d3a7c1f20e22', label: 'Light stretching', order: 4 } },
  })],
  ['delete', '/user/checklist/items/{itemId}', op({
    id: 'deleteChecklistItem', tag: 'Checklist', summary: 'Remove an item', params: [P.itemId], errors: [400, 401, 404, 429, 503],
    description: 'Past days that it was ticked on still show it.',
    ok: { description: 'Removed', schema: { nullable: true } }, example: null,
  })],
  ['get', '/user/checklist/history', op({
    id: 'getChecklistHistory', tag: 'Checklist', summary: 'Which items were completed on which days', errors: [400, 401, 429, 503],
    params: [requiredQuery(P.from), requiredQuery(P.to)], description: 'At most 92 days at a time.',
    ok: { description: 'Days with at least one completed item, newest first', schema: obj({ days: list(obj({ date: date(), completedCount: int(), completed: list(obj({ id: objectId(), label: str() })) })) }) },
    example: { days: [{ date: '2026-10-27', completedCount: 1, completed: [{ id: '65f1c2a4b8e9d3a7c1f20e21', label: 'Take a rest break' }] }] },
  })],
  ['get', '/user/checklist', op({
    id: 'getChecklist', tag: 'Checklist', summary: 'The checklist for one day', params: [P.localDate], errors: [400, 401, 429, 503],
    description: 'Each day starts fresh (nothing ticked); earlier days keep their ticks.',
    ok: { description: 'The day', schema: ref('ChecklistDay') }, example: { date: '2026-10-28', items: [{ id: '65f1c2a4b8e9d3a7c1f20e21', label: 'Take a rest break', completed: true }], progress: { done: 1, total: 1 } },
  })],
  ['put', '/user/checklist/{date}/items/{itemId}', op({
    id: 'setChecklistItem', tag: 'Checklist', summary: 'Tick or untick an item on a day', params: [P.date, P.itemId], errors: [...USER_ERRORS, 404],
    body: obj({ completed: bool() }), bodyExample: { completed: true },
    ok: { description: 'Saved', schema: obj({ date: date(), itemId: objectId(), completed: bool() }) }, example: { date: '2026-10-28', itemId: '65f1c2a4b8e9d3a7c1f20e21', completed: true },
  })],

  // ---- hydration
  ['get', '/user/hydration', op({
    id: 'getHydration', tag: 'Hydration', summary: 'The user\'s hydration reminder times for a day, with done flags', params: [P.localDate], errors: [400, 401, 429, 503],
    description: 'No amount of water is ever stored or suggested.',
    ok: { description: 'The day', schema: obj({ date: date(), reminders: list(ref('HydrationSlot')) }) }, example: { date: '2026-10-28', reminders: [{ time: '10:00', done: true }, { time: '15:00', done: false }] },
  })],
  ['put', '/user/hydration/{date}/{time}', op({
    id: 'setHydrationDone', tag: 'Hydration', summary: 'Mark a hydration reminder done (or not)', params: [P.date, P.time], errors: USER_ERRORS,
    description: 'The time must be one of the user\'s hydration reminder times.',
    body: obj({ done: bool() }), bodyExample: { done: true },
    ok: { description: 'Saved', schema: obj({ date: date(), time: hhmm(), done: bool() }) }, example: { date: '2026-10-28', time: '10:00', done: true },
  })],

  // ---- reminders
  ['get', '/user/reminders', op({
    id: 'getReminders', tag: 'Reminders', summary: 'All three reminders with their status', params: [P.localDate], errors: [400, 401, 429, 503],
    description: 'All reminders start switched off until the user turns them on. `status` is disabled, paused, snoozed or active.',
    ok: { description: 'The reminders', schema: obj({ reminders: list(ref('Reminder')) }) },
    example: { reminders: [{ type: 'period', enabled: true, paused: false, snoozedUntil: null, status: 'active', leadDays: 2, timeOfDay: '09:00' }, { type: 'daily_log', enabled: false, paused: false, snoozedUntil: null, status: 'disabled', timeOfDay: '20:00' }, { type: 'hydration', enabled: true, paused: false, snoozedUntil: null, status: 'active', times: ['10:00', '15:00'] }] },
  })],
  ['get', '/user/reminders/schedule', op({
    id: 'getReminderSchedule', tag: 'Reminders', summary: 'The notifications the phone should schedule', errors: [400, 401, 429, 503],
    params: [param('days', 'query', int({ minimum: 1, maximum: 90, default: 30 }), 'How many days ahead'), P.localDate],
    description: 'Computed fresh from the CURRENT period history every time, so an edited or deleted period can never leave a stale reminder. After any change to periods or reminder settings (and on app start), cancel the phone\'s old notifications and schedule this list. Times are the user\'s local time; the server does no time-zone conversion.',
    ok: { description: 'The schedule', schema: obj({ generatedFor: date(), days: int(), estimated: bool({ example: true }), notifications: list(ref('Notification')) }) },
    example: { generatedFor: '2026-10-28', days: 30, estimated: true, notifications: [{ type: 'period', date: '2026-10-27', time: '09:00', text: 'Your period is estimated to start in 2 days.' }] },
  })],
  ['patch', '/user/reminders/{type}', op({
    id: 'updateReminder', tag: 'Reminders', summary: 'Turn a reminder on or off, pause, snooze, or change its time', params: [P.type], errors: USER_ERRORS,
    description: 'Settings that do not apply to a type are refused: `leadDays` and `timeOfDay` for period; `timeOfDay` for daily_log; `times` (up to 12, HH:MM) for hydration. `snoozeDays` 1 to 30 skips today and the following days; 0 or null cancels a snooze. A hydration reminder cannot be turned on without times.',
    body: obj({ enabled: bool(), paused: bool(), snoozeDays: nullable(int({ minimum: 0, maximum: 30 })), leadDays: int({ minimum: 0, maximum: 7 }), timeOfDay: hhmm('09:00'), times: list(hhmm()) }, [], { description: 'Send at least one.' }),
    bodyExample: { enabled: true, leadDays: 2, timeOfDay: '09:00' },
    ok: { description: 'Saved', schema: obj({ reminder: ref('Reminder') }) }, example: { reminder: { type: 'period', enabled: true, paused: false, snoozedUntil: null, status: 'active', leadDays: 2, timeOfDay: '09:00' } },
  })],

  // ---- tips and self-care
  ['get', '/user/tips', op({
    id: 'getTips', tag: 'Self-care', summary: 'Reviewed tips', errors: [400, 401, 429, 503],
    params: [param('category', 'query', str({ enum: ['food', 'activity'] }), 'Only this type'), P.localDate],
    description: 'Only tips that have been clinically reviewed AND activated are returned. While a period is logged (`inPeriod`), the tips marked "only during a period" are added. Activity tips are marked optional and skippable. Empty until the admin has activated tips.',
    ok: { description: 'The tips', schema: obj({ inPeriod: bool(), tips: list(ref('UserTip')) }) },
    example: { inPeriod: false, tips: [{ id: '65f1c2a4b8e9d3a7c1f20e31', category: 'activity', title: 'Light walking', text: 'A gentle walk is optional. Rest today if you prefer.', optional: true, canSkip: true }] },
  })],
  ['get', '/user/selfcare/today', op({
    id: 'getSelfCareToday', tag: 'Self-care', summary: 'Everything the Daily Self-Care screen needs, in one call', params: [P.localDate], errors: [400, 401, 429, 503],
    ok: { description: 'Checklist, hydration and tips for the day', schema: obj({ date: date(), inPeriod: bool(), checklist: ref('ChecklistDay'), hydration: list(ref('HydrationSlot')), tips: list(ref('UserTip')) }) },
    example: { date: '2026-10-28', inPeriod: false, checklist: { date: '2026-10-28', items: [], progress: { done: 0, total: 0 } }, hydration: [{ time: '10:00', done: false }], tips: [] },
  })],

  // ---- sync
  ['post', '/user/sync', op({
    id: 'sync', tag: 'Sync', summary: 'Push the phone\'s changes and pull the server\'s, in one call', errors: USER_ERRORS,
    description: 'See docs/sync-guide.md for the full protocol (cursor, paging, conflicts, deletes, erase, restore). Safe to repeat: sending the same changes again changes nothing. Accepts bodies up to 2 MB, at most 500 records per list.',
    body: ref('SyncRequest'),
    bodyExample: {
      since: '2026-10-28T08:00:00.000Z', epoch: '1',
      changes: {
        periods: [{ id: '65f1c2a4b8e9d3a7c1f20e41', startDate: '2026-09-01', endDate: '2026-09-05', notes: null, clientUpdatedAt: '2026-10-28T08:30:00.000Z' }],
        symptoms: [{ date: '2026-10-27', symptoms: ['cramps'], flow: 'light', mood: 'calm', clientUpdatedAt: '2026-10-28T08:30:00.000Z' }],
      },
    },
    ok: { description: 'What was applied, and what changed on the server', schema: ref('SyncResponse') },
    example: {
      serverTime: '2026-10-28T09:00:00.000Z', cursor: '2026-10-28T09:00:00.000Z', hasMore: false, epoch: '1', resyncRequired: false,
      push: { applied: { periods: 1, symptoms: 1 }, unchanged: {}, rejected: [], warnings: [] }, changes: { settings: null, periods: [], checklistItems: [], checklistLogs: [], symptoms: [], hydrationLogs: [], reminders: [] },
    },
  })],

  // ---- admin
  ['post', '/admin/auth/login', op({
    id: 'adminLogin', tag: 'Admin: sign in', auth: 'none', summary: 'Sign in as the admin', errors: [400, 401, 429],
    description: 'The admin is one predefined account from the server\'s settings. Five FAILED attempts lock the door for 15 minutes (even the correct password is refused meanwhile). The token lasts 8 hours.',
    body: obj({ identifier: str({ example: 'admin@example.com' }), password: str({ format: 'password' }) }), bodyExample: { identifier: 'admin@example.com', password: 'the-admin-password' },
    ok: { description: 'Signed in', schema: obj({ admin: obj({ email: str(), role: str({ example: 'admin' }) }), token: str() }) },
    example: { admin: { email: 'admin@example.com', role: 'admin' }, token: '<jwt>' },
  })],
  ['get', '/admin/me', op({
    id: 'adminMe', tag: 'Admin: sign in', auth: 'admin', summary: 'Check the admin token', errors: [401, 429],
    ok: { description: 'The admin', schema: obj({ admin: obj({ email: str(), role: str() }) }) }, example: { admin: { email: 'admin@example.com', role: 'admin' } },
  })],
  ['get', '/admin/dashboard', op({
    id: 'adminDashboard', tag: 'Admin: dashboard', auth: 'admin', summary: 'Aggregate numbers (never an individual\'s data)', errors: [401, 429],
    description: 'Counts of users, records and active reminders. A count of 1 to 4 is returned as the string "<5" so a small number cannot point at one person; show it as it is. Tip counts are exact.',
    ok: { description: 'The numbers', schema: ref('Dashboard') },
    example: { generatedAt: '2026-10-28T09:00:00.000Z', privacyNote: 'Aggregates only. Counts of 1 to 4 are shown as "<5" to protect privacy.', feature: { enabled: true }, users: { total: 120, activeLast7Days: 64, activeLast30Days: '<5' }, records: { periods: 410, symptomLogs: 900, checklistItemsCompleted: 1500, hydrationRemindersDone: 700 }, activeReminders: { period: 80, daily_log: 22, hydration: 51 }, tips: { total: 9, active: 5, awaitingReview: 4 } },
  })],
  ['get', '/admin/tips', op({
    id: 'adminListTips', tag: 'Admin: tips', auth: 'admin', summary: 'All tips, including hidden ones', errors: [400, 401, 429],
    params: [param('category', 'query', str({ enum: ['food', 'activity'] }), 'Only this type'), param('active', 'query', bool(), 'Only live (true) or hidden (false)'), param('reviewed', 'query', bool(), 'Only reviewed (true) or not yet reviewed (false)'), P.page, limit(200, 50)],
    ok: { description: 'A page of tips', schema: obj({ items: list(ref('AdminTip')), page: int(), limit: int(), total: int() }) }, example: { items: [adminTipExample], page: 1, limit: 50, total: 1 },
  })],
  ['post', '/admin/tips', op({
    id: 'adminCreateTip', tag: 'Admin: tips', auth: 'admin', summary: 'Write a new tip', status: 201, errors: [400, 401, 409, 429],
    description: 'New tips start hidden and unreviewed. Titles are unique within a type.',
    body: obj({ category: str({ enum: ['food', 'activity'] }), title: str({ maxLength: 100 }), text: str({ maxLength: 500 }), showWhen: str({ enum: ['always', 'period'], default: 'always' }) }, ['category', 'title', 'text']),
    bodyExample: { category: 'activity', title: 'Light walking', text: 'A gentle walk is optional. Rest today if you prefer.', showWhen: 'always' },
    ok: { description: 'Created', schema: obj({ tip: ref('AdminTip') }) }, example: { tip: adminTipExample },
  })],
  ['get', '/admin/tips/{id}', op({
    id: 'adminGetTip', tag: 'Admin: tips', auth: 'admin', summary: 'One tip', params: [P.id], errors: [400, 401, 404, 429],
    ok: { description: 'The tip', schema: obj({ tip: ref('AdminTip') }) }, example: { tip: adminTipExample },
  })],
  ['patch', '/admin/tips/{id}', op({
    id: 'adminUpdateTip', tag: 'Admin: tips', auth: 'admin', summary: 'Edit a tip', params: [P.id], errors: [400, 401, 404, 409, 429],
    description: 'Changing the wording (type, title, text or when it shows) of a reviewed or live tip CLEARS its review and takes it offline (`reviewReset: true`): it must be reviewed and activated again. Saving unchanged wording keeps the review.',
    body: obj({ category: str({ enum: ['food', 'activity'] }), title: str({ maxLength: 100 }), text: str({ maxLength: 500 }), showWhen: str({ enum: ['always', 'period'] }) }, [], { description: 'Send at least one.' }),
    bodyExample: { text: 'A gentle walk is optional. You can rest instead.' },
    ok: { description: 'Saved', schema: obj({ tip: ref('AdminTip'), reviewReset: bool() }) }, example: { tip: adminTipExample, reviewReset: false },
  })],
  ['post', '/admin/tips/{id}/review', op({
    id: 'adminReviewTip', tag: 'Admin: tips', auth: 'admin', summary: 'Record that a clinician reviewed a tip', params: [P.id], errors: [400, 401, 404, 429],
    body: obj({ reviewedAt: date('2026-10-20', 'The review date. Defaults to today; cannot be in the future.'), reviewedBy: str({ maxLength: 100, example: 'Dr. A. Rao' }) }, []),
    bodyExample: { reviewedAt: '2026-10-20', reviewedBy: 'Dr. A. Rao' },
    ok: { description: 'Recorded', schema: obj({ tip: ref('AdminTip') }) }, example: { tip: { ...adminTipExample, reviewedAt: '2026-10-20T00:00:00.000Z', reviewedBy: 'Dr. A. Rao' } },
  })],
  ['patch', '/admin/tips/{id}/active', op({
    id: 'adminSetTipActive', tag: 'Admin: tips', auth: 'admin', summary: 'Show or hide a tip', params: [P.id], errors: [400, 401, 404, 409, 429],
    description: 'A tip that has not been reviewed cannot be activated (409 TIP_NOT_REVIEWED).',
    body: obj({ active: bool() }), bodyExample: { active: true },
    ok: { description: 'Saved', schema: obj({ tip: ref('AdminTip') }) }, example: { tip: { ...adminTipExample, active: true, reviewedAt: '2026-10-20T00:00:00.000Z', reviewedBy: 'Dr. A. Rao' } },
  })],
  ['delete', '/admin/tips/{id}', op({
    id: 'adminDeleteTip', tag: 'Admin: tips', auth: 'admin', summary: 'Delete a tip', params: [P.id], errors: [400, 401, 404, 429],
    ok: { description: 'Deleted', schema: { nullable: true } }, example: null,
  })],
  ['get', '/admin/content', op({
    id: 'adminGetContent', tag: 'Admin: content', auth: 'admin', summary: 'Disclaimer, privacy text and the default checklist', errors: [401, 429],
    ok: { description: 'The content', schema: obj({ content: ref('AdminContent') }) },
    example: { content: { disclaimerText: 'HerCare is a wellness and tracking tool, not a medical diagnosis or contraception app.', privacyText: 'Your data is yours.', defaultChecklistItems: [{ id: 'rest-break', label: 'Take a rest break' }], updatedAt: '2026-10-28T09:00:00.000Z' } },
  })],
  ['patch', '/admin/content', op({
    id: 'adminUpdateContent', tag: 'Admin: content', auth: 'admin', summary: 'Change the disclaimer, privacy text and/or default checklist', errors: [400, 401, 429],
    description: 'The disclaimer cannot be blank (20 to 2000 characters). The default checklist (max 20 items, unique ids) is copied to NEW users only; existing users keep their own.',
    body: obj({ disclaimerText: str({ minLength: 20, maxLength: 2000 }), privacyText: str({ minLength: 20, maxLength: 4000 }), defaultChecklistItems: list(obj({ id: str({ pattern: '^[a-z0-9-]{1,40}$' }), label: str({ maxLength: 80 }) })) }, [], { description: 'Send at least one.' }),
    bodyExample: { privacyText: 'Your data is yours. It is used only to run HerCare and can be deleted at any time.' },
    ok: { description: 'Saved', schema: obj({ content: ref('AdminContent') }) },
    example: { content: { disclaimerText: 'HerCare is a wellness and tracking tool, not a medical diagnosis or contraception app.', privacyText: 'Your data is yours. It is used only to run HerCare and can be deleted at any time.', defaultChecklistItems: [{ id: 'rest-break', label: 'Take a rest break' }], updatedAt: '2026-10-28T09:05:00.000Z' } },
  })],
  ['get', '/admin/settings', op({
    id: 'adminGetSettings', tag: 'Admin: settings', auth: 'admin', summary: 'The on/off switch and default cycle values', errors: [401, 429],
    ok: { description: 'The settings', schema: obj({ settings: ref('AdminSettings') }) }, example: { settings: { featureEnabled: true, defaultCycleLength: 28, defaultPeriodDuration: 5, updatedAt: '2026-10-28T09:00:00.000Z' } },
  })],
  ['patch', '/admin/settings', op({
    id: 'adminUpdateSettings', tag: 'Admin: settings', auth: 'admin', summary: 'Switch HerCare on or off, and set the defaults', errors: [400, 401, 429],
    description: 'While `featureEnabled` is false every user endpoint returns 503 FEATURE_DISABLED, except /user/me, export and erase. The defaults apply to users who have not set their own values.',
    body: obj({ featureEnabled: bool(), defaultCycleLength: int({ minimum: 15, maximum: 60 }), defaultPeriodDuration: int({ minimum: 1, maximum: 15 }) }, [], { description: 'Send at least one.' }),
    bodyExample: { featureEnabled: true, defaultCycleLength: 28, defaultPeriodDuration: 5 },
    ok: { description: 'Saved', schema: obj({ settings: ref('AdminSettings') }) }, example: { settings: { featureEnabled: true, defaultCycleLength: 28, defaultPeriodDuration: 5, updatedAt: '2026-10-28T09:10:00.000Z' } },
  })],
];

// ---------------------------------------------------------------- the document
const paths = {};
for (const [method, path, operation] of OPS) (paths[path] ??= {})[method] = operation;

const openapi = {
  openapi: '3.0.3',
  info: {
    title: 'HerCare API',
    version: '1.0.0',
    description: [
      'Backend for HerCare Women, a free period tracker inside the DBI app.',
      '',
      '**Who signs in.** Users are DBI users: send the token DBI gave them as `Authorization: Bearer <token>`. HerCare has no passwords of its own for users. The admin signs in with `POST /admin/auth/login` and gets a separate admin token. The two kinds of token do not work on each other\'s routes.',
      '',
      '**Envelope.** Success: `{ "success": true, "message": "...", "data": { ... } }`. Error: `{ "success": false, "error": { "code": "...", "message": "...", "details": [...] } }`.',
      '',
      '**Dates** are plain calendar dates, `YYYY-MM-DD`, never timestamps. Times of day are `HH:MM` in the user\'s local time. Send `?date=` (the phone\'s local date) wherever it is accepted.',
      '',
      '**Estimates.** Predicted dates are always estimates and are never stored as history.',
      '',
      'Guides: docs/mobile-integration-guide.md, docs/sync-guide.md, docs/estimate-rule.md, docs/admin-panel-guide.md.',
    ].join('\n'),
  },
  servers: [{ url: 'http://localhost:5000/api', description: 'Local development. Replace with your server\'s address.' }],
  tags: [
    'Health', 'Content', 'Account', 'Settings', 'Periods', 'Cycle', 'Symptoms', 'Checklist', 'Hydration', 'Reminders', 'Self-care', 'Sync',
    'Admin: sign in', 'Admin: dashboard', 'Admin: tips', 'Admin: content', 'Admin: settings',
  ].map((name) => ({ name })),
  paths,
  components: {
    securitySchemes: {
      userToken: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'The token DBI issued to the signed-in user (its `id` claim is the user id). HS256.' },
      adminToken: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'From POST /admin/auth/login. Lasts 8 hours.' },
    },
    schemas,
    responses,
  },
};

export default openapi;
