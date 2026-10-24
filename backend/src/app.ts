// Imported first so the Sentry SDK is initialised before `express` and `http`
// are required, which is what lets it instrument them.
import { sentryEnabled } from './config/sentry';
import * as Sentry from '@sentry/node';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';

import { env } from './config/env';
import { isDBConnected } from './config/db';
import { errorHandler } from './middleware/errorHandler';
import { SCAN_IMAGE_DIR } from './services/storage.service';

import authRoutes from './modules/auth/auth.routes';
import farmProfileRoutes from './modules/users/farmProfile.routes';
import cropListingRoutes from './modules/crop-listing/cropListing.routes';
import buyerRequirementRoutes from './modules/buyer-requirements/buyerRequirement.routes';
import matchingRoutes from './modules/matching/matching.routes';
import marketplaceRoutes from './modules/marketplace/marketplace.routes';
import cropPredictionRoutes from './modules/crop-prediction/cropPrediction.routes';
import cropRecommendationRoutes from './modules/crop-recommendation/cropRecommendation.routes';
import notificationRoutes from './modules/notifications/notification.routes';
import userRoutes from './modules/users/user.routes';
import orderRoutes from './modules/orders/order.routes';
import messageRoutes from './modules/messages/message.routes';
import cropHealthRoutes from './modules/crop-health/cropHealth.routes';
import marketPriceRoutes from './modules/market-prices/marketPrice.routes';
import weatherRoutes from './modules/weather/weather.routes';
import dashboardRoutes from './modules/dashboard/dashboard.routes';

const app = express();

app.use(helmet());

app.use(
  cors({
    origin: env.CORS_ORIGINS.split(','),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  })
);

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Scan images written by the crop-health module. They are content-addressed, so
// the bytes behind a URL never change and can be cached aggressively. The
// resource-policy header is re-set because helmet defaults it to `same-origin`,
// which would block the Vite dev server on a different port from loading them.
app.use(
  env.UPLOAD_PUBLIC_PATH,
  express.static(SCAN_IMAGE_DIR, {
    index: false,
    dotfiles: 'ignore',
    immutable: true,
    maxAge: '30d',
    setHeaders: (res) => {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    },
  })
);

// MongoDB operator-injection guard. Express 5 exposes `req.query` and
// `req.params` as prototype getters, so a cleaned value is written back with
// `Object.defineProperty` — a plain `req.query = ...` assignment throws, which
// is why `express-mongo-sanitize` cannot be used here.
const UNSAFE_KEY = /^\$|\./;

function stripUnsafeKeys(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    let arrayChanged = false;
    const cleaned = obj.map((item) => {
      const next = stripUnsafeKeys(item);
      if (next !== item) arrayChanged = true;
      return next;
    });
    return arrayChanged ? cleaned : obj;
  }

  const source = obj as Record<string, unknown>;
  const target: Record<string, unknown> = {};
  let changed = false;

  for (const key of Object.keys(source)) {
    if (UNSAFE_KEY.test(key)) {
      changed = true;
      continue;
    }
    const value = stripUnsafeKeys(source[key]);
    if (value !== source[key]) changed = true;
    target[key] = value;
  }

  return changed ? target : obj;
}

app.use((req, _res, next) => {
  if (req.body && typeof req.body === 'object') req.body = stripUnsafeKeys(req.body);

  // Only shadow the getters when something actually had to be removed, so a
  // normal request keeps Express's own query/params objects untouched.
  for (const key of ['query', 'params'] as const) {
    const original = (req as unknown as Record<string, unknown>)[key];
    if (!original || typeof original !== 'object') continue;
    const cleaned = stripUnsafeKeys(original);
    if (cleaned !== original) {
      Object.defineProperty(req, key, {
        value: cleaned,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }
  }

  if (req.headers && typeof req.headers === 'object') {
    for (const key of Object.keys(req.headers)) {
      if (UNSAFE_KEY.test(key)) delete (req.headers as Record<string, unknown>)[key];
    }
  }

  next();
});

if (env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', globalLimiter);

// Auth needs headroom: a handful of mistyped passwords or repeated OTP requests
// should not lock a real user out for a full minute during normal use.
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/v1/auth', authLimiter);

app.get('/api/v1/health', (_req, res) => {
  res.status(200).json({
    success: true,
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
      db: isDBConnected ? 'connected' : 'disconnected',
      uptime: process.uptime(),
    },
  });
});

app.get('/api/v1/ready', (_req, res) => {
  const ready = isDBConnected;
  res.status(ready ? 200 : 503).json({
    success: ready,
    data: {
      status: ready ? 'ready' : 'db_unavailable',
      timestamp: new Date().toISOString(),
      db: isDBConnected ? 'connected' : 'disconnected',
    },
  });
});

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/farm-profiles', farmProfileRoutes);
app.use('/api/v1/crop-listings', cropListingRoutes);
app.use('/api/v1/buyer-requirements', buyerRequirementRoutes);
app.use('/api/v1/matches', matchingRoutes);
app.use('/api/v1/marketplace', marketplaceRoutes);
app.use('/api/v1/crop-predictions', cropPredictionRoutes);
app.use('/api/v1/crop-recommendations', cropRecommendationRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/orders', orderRoutes);
app.use('/api/v1/messages', messageRoutes);
app.use('/api/v1/crop-health', cropHealthRoutes);
app.use('/api/v1/market-prices', marketPriceRoutes);
app.use('/api/v1/weather', weatherRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);

app.use('/api/v1', (_req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Route not found',
    },
  });
});

// Must sit after every route and before our own error middleware: Express only
// invokes error handlers registered further down the stack, so the previous
// placement above the routes meant Sentry never saw a single error.
if (sentryEnabled) {
  Sentry.setupExpressErrorHandler(app);
}

app.use(errorHandler);

export default app;
