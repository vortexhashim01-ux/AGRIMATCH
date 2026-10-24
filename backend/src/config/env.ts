import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

const candidatePaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), 'backend/.env'),
  path.resolve(__dirname, '../../.env'),
];

let loadedPath: string | undefined;
for (const p of candidatePaths) {
  if (fs.existsSync(p)) {
    dotenv.config({ path: p });
    loadedPath = p;
    break;
  }
}

if (!loadedPath) {
  dotenv.config();
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default(5000),
  MONGODB_URI: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  CLIENT_URL: z.string().url(),
  CORS_ORIGINS: z.string(),
  ENCRYPTION_KEY: z.string().length(64),
  // 'console' logs the OTP (dev only); 'mock' pretends to send; 'live' uses MSG91.
  OTP_DELIVERY_MODE: z.enum(['console', 'mock', 'live']).default('console'),
  MSG91_AUTH_KEY: z.string().optional(),
  MSG91_OTP_TEMPLATE_ID: z.string().optional(),
  // SMTP/Email configuration - temporarily disabled
  // SMTP_HOST: z.string().optional(),
  // SMTP_PORT: z.union([z.string(), z.number()]).transform(Number).optional(),
  // SMTP_USER: z.string().optional(),
  // SMTP_PASS: z.string().optional(),
  // EMAIL_FROM: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
  // ── Third-party data providers ──────────────────────────────────────────
  // Agmarknet daily mandi prices are served through the data.gov.in resource
  // API, so the key here is a data.gov.in API key.
  AGMARKNET_API_KEY: z.string().optional(),
  AGMARKNET_RESOURCE_ID: z
    .string()
    .default('9ef84268-d588-465a-a308-a864a43d0070'),
  // OpenWeatherMap (5-day / 3-hour forecast).
  WEATHER_API_KEY: z.string().optional(),
  WEATHER_API_BASE_URL: z
    .string()
    .default('https://api.openweathermap.org/data/2.5'),
  // OpenAI-compatible vision endpoint used for crop-disease diagnosis.
  VISION_API_KEY: z.string().optional(),
  VISION_API_URL: z
    .string()
    .default('https://api.openai.com/v1/chat/completions'),
  VISION_MODEL: z.string().default('gpt-4o-mini'),
  // ── Uploaded scan images (local disk driver) ─────────────────────────────
  // Directory is resolved relative to the backend package root, not the shell's
  // cwd, so `npm run dev` from the repo root and from `backend/` behave the same.
  UPLOAD_DIR: z.string().default('uploads'),
  // Public URL prefix the images are served under (see the static mount in app.ts).
  UPLOAD_PUBLIC_PATH: z.string().default('/uploads'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
