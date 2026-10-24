import crypto from 'crypto';
import { env } from '../config/env';
import { Otp } from '../modules/auth/otp.model';

const OTP_LENGTH = 6;
const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_REQUESTS_PER_WINDOW = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const MSG91_SEND_OTP_URL = 'https://control.msg91.com/api/v5/otp';
const MSG91_TIMEOUT_MS = 10 * 1000;
// Sentinel stored in `codeHash` once an OTP has been used, so the stored hash can
// never match a freshly computed one and the rate-limit history is preserved.
const CONSUMED_CODE = 'consumed';

function hashCode(identifier: string, code: string): string {
  return crypto.createHmac('sha256', env.ENCRYPTION_KEY).update(`${identifier}:${code}`).digest('hex');
}

function codesMatch(stored: string, candidate: string): boolean {
  const a = Buffer.from(stored);
  const b = Buffer.from(candidate);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function generateOTP(): string {
  const digits = '0123456789';
  let otp = '';
  for (let i = 0; i < OTP_LENGTH; i++) {
    otp += digits[crypto.randomInt(0, digits.length)];
  }
  return otp;
}

export async function isRateLimited(identifier: string): Promise<boolean> {
  const record = await Otp.findOne({ identifier }).select('requestedAt');
  if (!record) {
    return false;
  }
  const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
  const recent = (record.requestedAt ?? []).filter((t) => t.getTime() > cutoff);
  return recent.length >= MAX_REQUESTS_PER_WINDOW;
}

export async function storeOTP(identifier: string, code: string): Promise<void> {
  const now = new Date();
  const cutoff = now.getTime() - RATE_LIMIT_WINDOW_MS;

  const existing = await Otp.findOne({ identifier }).select('requestedAt');
  const requestedAt = (existing?.requestedAt ?? []).filter((t) => t.getTime() > cutoff);
  requestedAt.push(now);

  await Otp.findOneAndUpdate(
    { identifier },
    {
      identifier,
      codeHash: hashCode(identifier, code),
      attempts: 0,
      codeExpiresAt: new Date(now.getTime() + OTP_TTL_MS),
      requestedAt,
      expiresAt: new Date(now.getTime() + RATE_LIMIT_WINDOW_MS),
    },
    { upsert: true }
  );
}

export async function verifyOTP(
  identifier: string,
  code: string
): Promise<'success' | 'invalid' | 'expired' | 'attempts_exceeded'> {
  const record = await Otp.findOne({ identifier });

  if (!record) {
    return 'invalid';
  }

  if (record.codeExpiresAt.getTime() < Date.now()) {
    return 'expired';
  }

  if (record.attempts >= MAX_ATTEMPTS) {
    return 'attempts_exceeded';
  }

  record.attempts += 1;
  await record.save();

  if (!codesMatch(record.codeHash, hashCode(identifier, code))) {
    return 'invalid';
  }

  // Consume the code, but keep `requestedAt` so the hourly request cap survives
  // a successful login instead of resetting on every verify.
  record.codeHash = CONSUMED_CODE;
  record.codeExpiresAt = new Date(0);
  await record.save();
  return 'success';
}

async function sendViaMSG91(identifier: string, otp: string): Promise<void> {
  const authKey = env.MSG91_AUTH_KEY;
  const templateId = env.MSG91_OTP_TEMPLATE_ID;
  if (!authKey || !templateId) {
    throw new Error('MSG91 credentials missing: set MSG91_AUTH_KEY and MSG91_OTP_TEMPLATE_ID');
  }

  const url = new URL(MSG91_SEND_OTP_URL);
  url.searchParams.set('template_id', templateId);
  url.searchParams.set('mobile', identifier.replace(/\D/g, ''));
  url.searchParams.set('authkey', authKey);
  url.searchParams.set('otp', otp);
  url.searchParams.set('otp_length', String(OTP_LENGTH));
  url.searchParams.set('otp_expiry', String(OTP_TTL_MS / 60000));
  // Without this MSG91 answers `type: success` even for an invalid auth key or
  // template, so misconfiguration would look like a delivered SMS.
  url.searchParams.set('realTimeResponse', '1');

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', authkey: authKey },
    signal: AbortSignal.timeout(MSG91_TIMEOUT_MS),
  });

  const body = (await response.json().catch(() => null)) as
    | { type?: string; message?: string; request_id?: string; code?: string }
    | null;

  if (!response.ok || body?.type !== 'success' || body?.code === '201') {
    const reason = body?.message ?? body?.request_id ?? 'unknown error';
    throw new Error(`MSG91 send failed (${response.status}): ${reason}`);
  }
}

export async function sendOTP(
  identifier: string,
  method: 'sms',
  otp: string
): Promise<void> {
  const mode = env.OTP_DELIVERY_MODE;

  if (mode === 'console') {
    console.log(`[OTP] ${identifier} (${method}): ${otp}`);
    return;
  }

  if (mode === 'mock') {
    console.log(`[OTP][mock] Would send to ${identifier} (${method}): ${otp}`);
    return;
  }

  await sendViaMSG91(identifier, otp);
}
