interface HttpError extends Error {
  statusCode?: number;
  code?: string;
  isOperational?: boolean;
}

export function createHttpError(
  message: string,
  statusCode: number,
  code: string
): HttpError {
  const err = new Error(message) as HttpError;
  err.statusCode = statusCode;
  err.code = code;
  err.isOperational = true;
  return err;
}

const DEFAULT_TIMEOUT_MS = 8000;

export interface FetchOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
  method?: string;
  body?: string;
}

/**
 * Wraps the global fetch with an abort-based timeout. Returns the raw response
 * so a caller that needs the upstream error body (the vision provider) can read
 * it; callers that only care about JSON should use `fetchJson`.
 */
export async function fetchWithTimeout(
  url: string,
  options?: FetchOptions
): Promise<Response> {
  const controller = new AbortController();
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      method: options?.method ?? 'GET',
      headers: options?.headers,
      body: options?.body,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw createHttpError('Upstream provider timed out', 504, 'PROVIDER_TIMEOUT');
    }
    throw createHttpError('Upstream provider is unreachable', 504, 'PROVIDER_TIMEOUT');
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson<T>(
  url: string,
  options?: { timeoutMs?: number; headers?: Record<string, string> }
): Promise<T> {
  const response = await fetchWithTimeout(url, options);

  if (!response.ok) {
    throw createHttpError(
      `Upstream provider responded with status ${response.status}`,
      502,
      'PROVIDER_UNAVAILABLE'
    );
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw createHttpError(
      'Upstream provider returned an unreadable response',
      502,
      'PROVIDER_UNAVAILABLE'
    );
  }
}
