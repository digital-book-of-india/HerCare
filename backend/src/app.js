import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import mongoose from 'mongoose';
import env from './config/env.config.js';
import { notFound, errorHandler } from './middlewares/errorHandler.middleware.js';
import { ipLimiter } from './middlewares/rateLimiter.middleware.js';
import { rejectUnsafeInput, noStore } from './middlewares/sanitize.middleware.js';
import { success } from './utils/response.util.js';
import userRoutes from './routes/user.routes.js';
import contentRoutes from './routes/content.routes.js';
import adminRoutes from './routes/admin/admin.routes.js';

const app = express();

// Behind a load balancer every request would otherwise appear to come from the proxy's IP.
app.set('trust proxy', env.trustProxy);

app.use(helmet());
app.use(cors({ origin: env.corsOrigins.length ? env.corsOrigins : false }));
app.use(noStore);

// For monitoring and load balancers: exempt from rate limits, and 503 when the database is down.
app.get('/api/health', (_req, res) => {
  const databaseUp = mongoose.connection.readyState === 1;
  if (databaseUp) return success(res, { status: 'ok', db: 'up' }, 'Server is running');
  return res.status(503).json({ success: false, message: 'Database unavailable', data: { status: 'degraded', db: 'down' } });
});

// Rate limiting comes BEFORE body parsing, so a flood of large bodies is refused cheaply.
app.use(ipLimiter);

// Bodies are small everywhere except sync. Sync's 2 MB body is parsed inside its own route, AFTER the
// caller has been identified (see user.routes.js), so an anonymous caller can never make the server
// parse megabytes. Any other path to sync (a trailing slash, other capitals) simply gets the small limit.
const parseSmallBody = express.json({ limit: '10kb' });
app.use((req, res, next) => (req.path === '/api/user/sync' ? next() : parseSmallBody(req, res, next)));
app.use(rejectUnsafeInput);

app.use('/api/content', contentRoutes);
app.use('/api/user', userRoutes);
app.use('/api/admin', adminRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
