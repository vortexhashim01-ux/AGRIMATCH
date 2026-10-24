import './testEnv';
import test from 'node:test';
import assert from 'node:assert/strict';
import { env } from '../src/config/env';
import {
  CONFIDENCE_THRESHOLD,
  diagnoseCropImage,
} from '../src/services/vision.service';

const REAL_KEY = 'test-vision-key';
const PLACEHOLDER_KEY = 'your_vision_api_key';

const INPUT = {
  buffer: Buffer.from('fake-image-bytes'),
  mimeType: 'image/png',
  cropName: 'Potato',
};

/** Wraps a model-authored JSON string the way an OpenAI-compatible provider would. */
function chatCompletion(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function withKey<T>(key: string | undefined, run: () => Promise<T>): Promise<T> {
  const previous = env.VISION_API_KEY;
  env.VISION_API_KEY = key;
  return run().finally(() => {
    env.VISION_API_KEY = previous;
  });
}

function stubFetch(
  t: { mock: { method: (o: object, m: string, i: unknown) => unknown } },
  impl: (...args: unknown[]) => Promise<Response>
): void {
  t.mock.method(globalThis, 'fetch', impl);
}

test('a missing key yields 503 PROVIDER_NOT_CONFIGURED', async () => {
  await assert.rejects(
    () => withKey(undefined, () => diagnoseCropImage(INPUT)),
    (err: { statusCode?: number; code?: string }) =>
      err.statusCode === 503 && err.code === 'PROVIDER_NOT_CONFIGURED'
  );
});

test('the placeholder key is treated as unconfigured', async () => {
  await assert.rejects(
    () => withKey(PLACEHOLDER_KEY, () => diagnoseCropImage(INPUT)),
    (err: { statusCode?: number; code?: string }) =>
      err.statusCode === 503 && err.code === 'PROVIDER_NOT_CONFIGURED'
  );
});

test('a confident diagnosis is passed through with its treatments', async (t) => {
  stubFetch(t, async () =>
    chatCompletion(
      JSON.stringify({
        disease: 'Late Blight',
        confidence: 0.91,
        severity: 'severe',
        treatmentSteps: ['Remove infected leaves', 'Apply copper fungicide'],
        preventionTips: ['Rotate crops'],
        alternatives: [{ disease: 'Early Blight', confidence: 0.4 }],
      })
    )
  );

  const result = await withKey(REAL_KEY, () => diagnoseCropImage(INPUT));

  assert.equal(result.disease, 'Late Blight');
  assert.equal(result.confidence, 0.91);
  assert.equal(result.severity, 'severe');
  assert.equal(result.treatmentSteps.length, 2);
  assert.deepEqual(result.preventionTips, ['Rotate crops']);
  assert.deepEqual(result.alternatives, [{ disease: 'Early Blight', confidence: 0.4 }]);
});

test('a diagnosis below the confidence threshold becomes "uncertain"', async (t) => {
  stubFetch(t, async () =>
    chatCompletion(
      JSON.stringify({
        disease: 'Late Blight',
        confidence: CONFIDENCE_THRESHOLD - 0.2,
        severity: 'severe',
        treatmentSteps: ['Remove infected leaves'],
        preventionTips: ['Rotate crops'],
        alternatives: [{ disease: 'Early Blight', confidence: 0.3 }],
      })
    )
  );

  const result = await withKey(REAL_KEY, () => diagnoseCropImage(INPUT));

  assert.equal(result.disease, 'uncertain');
  assert.equal(result.severity, 'unknown');
  // Low-confidence results deliberately withhold treatment guidance.
  assert.deepEqual(result.treatmentSteps, []);
  assert.deepEqual(result.preventionTips, []);
  // The runner-up is still surfaced, but the top candidate is not repeated as
  // its own alternative.
  assert.deepEqual(result.alternatives, [{ disease: 'Early Blight', confidence: 0.3 }]);
});

test('an unreadable image reports no self-referential alternative', async (t) => {
  stubFetch(t, async () =>
    chatCompletion(
      JSON.stringify({
        disease: 'uncertain',
        confidence: 0,
        severity: 'unknown',
        treatmentSteps: [],
        preventionTips: [],
        alternatives: [{ disease: 'uncertain', confidence: 0 }],
      })
    )
  );

  const result = await withKey(REAL_KEY, () => diagnoseCropImage(INPUT));

  assert.equal(result.disease, 'uncertain');
  assert.deepEqual(result.alternatives, [], 'uncertain must not be listed as its own alternative');
});

test('the outgoing request uses the configured model, url and bearer key', async (t) => {
  let seen: { url: string; init: RequestInit } | undefined;
  stubFetch(t, async (url: unknown, init: unknown) => {
    seen = { url: String(url), init: init as RequestInit };
    return chatCompletion(JSON.stringify({ disease: 'uncertain', confidence: 0 }));
  });

  await withKey(REAL_KEY, () => diagnoseCropImage(INPUT));

  assert.equal(seen?.url, env.VISION_API_URL);
  assert.equal(
    (seen?.init.headers as Record<string, string>).Authorization,
    `Bearer ${REAL_KEY}`
  );

  const body = JSON.parse(String(seen?.init.body));
  assert.equal(body.model, env.VISION_MODEL);
  assert.equal(body.response_format.type, 'json_object');

  const userContent = body.messages[1].content;
  const imagePart = userContent.find((part: { type: string }) => part.type === 'image_url');
  assert.ok(
    imagePart.image_url.url.startsWith('data:image/png;base64,'),
    'the image must be sent as a base64 data URI'
  );
});

test('a rejecting provider becomes 502 VISION_UNAVAILABLE', async (t) => {
  stubFetch(t, async () => new Response('overloaded', { status: 503 }));

  await assert.rejects(
    () => withKey(REAL_KEY, () => diagnoseCropImage(INPUT)),
    (err: { statusCode?: number; code?: string; message: string }) =>
      err.statusCode === 502 &&
      err.code === 'VISION_UNAVAILABLE' &&
      err.message.includes('503')
  );
});

test('malformed JSON from the provider becomes 502 VISION_UNAVAILABLE', async (t) => {
  stubFetch(t, async () => chatCompletion('this is not json'));

  await assert.rejects(
    () => withKey(REAL_KEY, () => diagnoseCropImage(INPUT)),
    (err: { statusCode?: number; code?: string }) =>
      err.statusCode === 502 && err.code === 'VISION_UNAVAILABLE'
  );
});

test('an empty completion becomes 502 VISION_UNAVAILABLE', async (t) => {
  stubFetch(t, async () => chatCompletion('   '));

  await assert.rejects(
    () => withKey(REAL_KEY, () => diagnoseCropImage(INPUT)),
    (err: { statusCode?: number; code?: string }) =>
      err.statusCode === 502 && err.code === 'VISION_UNAVAILABLE'
  );
});

test('a network failure becomes 502 rather than leaking a 500', async (t) => {
  stubFetch(t, async () => {
    throw new Error('ECONNRESET');
  });

  await assert.rejects(
    () => withKey(REAL_KEY, () => diagnoseCropImage(INPUT)),
    (err: { statusCode?: number; code?: string }) =>
      err.statusCode === 502 && err.code === 'VISION_UNAVAILABLE'
  );
});

test('out-of-range confidences are clamped and unknown severities fall back', async (t) => {
  stubFetch(t, async () =>
    chatCompletion(
      JSON.stringify({
        disease: 'Bacterial Wilt',
        confidence: 7,
        severity: 'apocalyptic',
        treatmentSteps: ['ok', '', 42],
        preventionTips: 'not-an-array',
        alternatives: 'also-not-an-array',
      })
    )
  );

  const result = await withKey(REAL_KEY, () => diagnoseCropImage(INPUT));

  assert.equal(result.confidence, 1, 'confidence above 1 must clamp to 1');
  assert.equal(result.severity, 'unknown');
  assert.deepEqual(result.treatmentSteps, ['ok']);
  assert.deepEqual(result.preventionTips, []);
  assert.deepEqual(result.alternatives, []);
});
