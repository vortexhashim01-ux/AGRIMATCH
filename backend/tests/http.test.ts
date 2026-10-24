import './testEnv';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createHttpError,
  fetchJson,
  fetchWithTimeout,
} from '../src/utils/http';

/** Replaces the global fetch for the duration of one test. */
function stubFetch(
  t: { mock: { method: (o: object, m: string, i: unknown) => unknown } },
  impl: (...args: unknown[]) => Promise<Response>
): void {
  t.mock.method(globalThis, 'fetch', impl);
}

test('createHttpError carries statusCode, code and the operational flag', () => {
  const err = createHttpError('boom', 409, 'CONFLICT_THING');

  assert.ok(err instanceof Error);
  assert.equal(err.message, 'boom');
  assert.equal(err.statusCode, 409);
  assert.equal(err.code, 'CONFLICT_THING');
  assert.equal(err.isOperational, true);
});

test('fetchJson returns the parsed body on a successful response', async (t) => {
  stubFetch(t, async () => new Response(JSON.stringify({ records: [1, 2] }), { status: 200 }));

  const payload = await fetchJson<{ records: number[] }>('https://provider.test/data');
  assert.deepEqual(payload.records, [1, 2]);
});

test('fetchJson maps a non-2xx provider response to 502 PROVIDER_UNAVAILABLE', async (t) => {
  stubFetch(t, async () => new Response('nope', { status: 500 }));

  await assert.rejects(
    () => fetchJson('https://provider.test/data'),
    (err: { statusCode?: number; code?: string }) =>
      err.statusCode === 502 && err.code === 'PROVIDER_UNAVAILABLE'
  );
});

test('fetchJson maps an unreadable body to 502 PROVIDER_UNAVAILABLE', async (t) => {
  stubFetch(t, async () => new Response('<html>not json</html>', { status: 200 }));

  await assert.rejects(
    () => fetchJson('https://provider.test/data'),
    (err: { statusCode?: number; code?: string }) =>
      err.statusCode === 502 && err.code === 'PROVIDER_UNAVAILABLE'
  );
});

test('fetchWithTimeout maps an aborted request to 504 PROVIDER_TIMEOUT', async (t) => {
  stubFetch(t, async () => {
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    throw abort;
  });

  await assert.rejects(
    () => fetchWithTimeout('https://provider.test/slow'),
    (err: { statusCode?: number; code?: string }) =>
      err.statusCode === 504 && err.code === 'PROVIDER_TIMEOUT'
  );
});

test('fetchWithTimeout maps a network failure to 504 PROVIDER_TIMEOUT', async (t) => {
  stubFetch(t, async () => {
    throw new Error('ECONNREFUSED');
  });

  await assert.rejects(
    () => fetchWithTimeout('https://provider.test/down'),
    (err: { statusCode?: number; code?: string }) =>
      err.statusCode === 504 && err.code === 'PROVIDER_TIMEOUT'
  );
});

test('fetchWithTimeout forwards method, headers and body to fetch', async (t) => {
  let seen: { url: string; init: RequestInit } | undefined;
  stubFetch(t, async (url: unknown, init: unknown) => {
    seen = { url: String(url), init: init as RequestInit };
    return new Response('{}', { status: 200 });
  });

  await fetchWithTimeout('https://provider.test/post', {
    method: 'POST',
    headers: { 'X-Test': 'yes' },
    body: '{"a":1}',
    timeoutMs: 1000,
  });

  assert.equal(seen?.url, 'https://provider.test/post');
  assert.equal(seen?.init.method, 'POST');
  assert.equal((seen?.init.headers as Record<string, string>)['X-Test'], 'yes');
  assert.equal(seen?.init.body, '{"a":1}');
});
