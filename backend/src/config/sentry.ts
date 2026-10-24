import * as Sentry from '@sentry/node';
import type { ErrorEvent } from '@sentry/node';
import { env } from './env';

const PLACEHOLDER_DSN = 'your_sentry_dsn_here';

/** Headers that carry credentials and must never leave the process. */
const SENSITIVE_HEADERS = new Set(['authorization', 'cookie', 'set-cookie']);

/**
 * True only when a real DSN is configured. Without it the SDK is never
 * initialised and every `captureException` elsewhere is a no-op, so the app
 * runs normally on a machine with no Sentry account.
 */
export const sentryEnabled = Boolean(
  env.SENTRY_DSN && !env.SENTRY_DSN.includes(PLACEHOLDER_DSN)
);

function redact(event: ErrorEvent): ErrorEvent {
  const headers = event.request?.headers;
  if (headers) {
    for (const key of Object.keys(headers)) {
      if (SENSITIVE_HEADERS.has(key.toLowerCase())) headers[key] = '[Filtered]';
    }
  }

  // Request bodies can carry passwords and OTPs. None of it is worth the risk
  // of shipping to a third party.
  if (event.request) delete event.request.data;

  return event;
}

// Initialised as a side effect of this import on purpose: the SDK has to
// register its module hooks before `express` and `http` are required, so this
// module must be imported ahead of them.
if (sentryEnabled) {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    // Trace everything locally, but only a fraction in production so cost does
    // not scale with every single request.
    tracesSampleRate: env.NODE_ENV === 'production' ? 0.1 : 1.0,
    sendDefaultPii: false,
    // Which errors reach Sentry at all is left to the SDK's own Express filter,
    // which reports only responses with a status of 500 or above
    // (see @sentry/core .../integrations/express/utils.js). That already drops
    // the everyday 400/401/403/404/409/429 outcomes this API returns, so there
    // is no need to filter on `isOperational` as well — doing that would also
    // hide genuine 5xx faults such as OTP_SEND_FAILED or a missing provider key.
    // Everything left here is about what the event is allowed to contain.
    beforeSend(event) {
      return redact(event);
    },
  });
}
