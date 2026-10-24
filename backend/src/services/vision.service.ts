import { env } from '../config/env';
import { createHttpError, fetchWithTimeout } from '../utils/http';

export interface VisionDiagnosis {
  disease: string;
  confidence: number;
  severity: 'low' | 'moderate' | 'severe' | 'unknown';
  treatmentSteps: string[];
  preventionTips: string[];
  alternatives: { disease: string; confidence: number }[];
}

export const CONFIDENCE_THRESHOLD = 0.6;

const PLACEHOLDER_KEY = 'your_vision_api_key';
const MAX_ALTERNATIVES = 3;

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

const SEVERITIES = ['low', 'moderate', 'severe', 'unknown'] as const;
type Severity = (typeof SEVERITIES)[number];

const SYSTEM_PROMPT =
  'You are an expert plant pathologist. Analyse the crop image the user sends and reply with a single JSON object only — no markdown, no prose. ' +
  'The object must have exactly these keys: "disease" (string), "confidence" (number between 0 and 1), ' +
  '"severity" (one of "low", "moderate", "severe", "unknown"), "treatmentSteps" (array of short strings), ' +
  '"preventionTips" (array of short strings), "alternatives" (array of objects, each with a "disease" string and a "confidence" number). ' +
  'Set "disease" to "uncertain" and "confidence" to 0 when the image is not a crop or cannot be assessed.';

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function coerceStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim())
    .slice(0, 10);
}

function coerceAlternatives(
  value: unknown
): { disease: string; confidence: number }[] {
  if (!Array.isArray(value)) return [];

  const alternatives: { disease: string; confidence: number }[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const disease = typeof record.disease === 'string' ? record.disease.trim() : '';
    const confidence = clamp01(Number(record.confidence));
    if (!disease) continue;
    alternatives.push({ disease, confidence });
  }
  return alternatives;
}

function coerceSeverity(value: unknown): Severity {
  return typeof value === 'string' && (SEVERITIES as readonly string[]).includes(value)
    ? (value as Severity)
    : 'unknown';
}

export async function diagnoseCropImage(input: {
  buffer: Buffer;
  mimeType: string;
  cropName?: string;
}): Promise<VisionDiagnosis> {
  const apiKey = env.VISION_API_KEY;

  if (!apiKey || apiKey === PLACEHOLDER_KEY) {
    throw createHttpError(
      'Crop disease diagnosis is not configured. Set VISION_API_KEY.',
      503,
      'PROVIDER_NOT_CONFIGURED'
    );
  }

  const cropHint = input.cropName ? ` The farmer says the crop is "${input.cropName}".` : '';
  const userText =
    'Identify the most likely disease or pest affecting the crop in this image.' +
    cropHint +
    ' Give your best confidence (0 to 1), a severity of "low", "moderate", "severe" or "unknown", ' +
    'concrete treatment steps, prevention tips, and up to 3 ranked alternative diagnoses.';

  const requestBody = {
    model: env.VISION_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: userText },
          {
            type: 'image_url',
            image_url: {
              url: `data:${input.mimeType};base64,${input.buffer.toString('base64')}`,
            },
          },
        ],
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
  };

  let response: Response;
  try {
    response = await fetchWithTimeout(env.VISION_API_URL, {
      method: 'POST',
      timeoutMs: 30000,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });
  } catch {
    // Network/timeout issues are surfaced as a provider failure, never as a 500.
    throw createHttpError('Vision provider is unavailable', 502, 'VISION_UNAVAILABLE');
  }

  if (!response.ok) {
    throw createHttpError(
      `Vision provider rejected the request with status ${response.status}`,
      502,
      'VISION_UNAVAILABLE'
    );
  }

  let payload: ChatCompletionResponse;
  try {
    payload = (await response.json()) as ChatCompletionResponse;
  } catch {
    throw createHttpError(
      'Vision provider returned an unreadable response',
      502,
      'VISION_UNAVAILABLE'
    );
  }

  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw createHttpError(
      'Vision provider returned an empty diagnosis',
      502,
      'VISION_UNAVAILABLE'
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw createHttpError(
      'Vision provider returned malformed JSON',
      502,
      'VISION_UNAVAILABLE'
    );
  }

  const record = (parsed && typeof parsed === 'object' ? parsed : {}) as Record<
    string,
    unknown
  >;

  const topDisease = typeof record.disease === 'string' ? record.disease.trim() : '';
  const topConfidence = clamp01(Number(record.confidence));

  const candidates = new Map<string, { disease: string; confidence: number }>();
  if (topDisease) {
    candidates.set(topDisease.toLowerCase(), {
      disease: topDisease,
      confidence: topConfidence,
    });
  }
  for (const alternative of coerceAlternatives(record.alternatives)) {
    const key = alternative.disease.toLowerCase();
    if (!candidates.has(key)) candidates.set(key, alternative);
  }
  const ranked = [...candidates.values()].sort(
    (a, b) => b.confidence - a.confidence
  );

  // The top candidate is reported through `disease`, so it is never repeated as
  // one of its own alternatives.
  const remaining = ranked.filter(
    (candidate) => candidate.disease.toLowerCase() !== topDisease.toLowerCase()
  );

  if (!topDisease || topConfidence < CONFIDENCE_THRESHOLD) {
    return {
      disease: 'uncertain',
      confidence: topConfidence,
      severity: 'unknown',
      treatmentSteps: [],
      preventionTips: [],
      alternatives: remaining.slice(0, MAX_ALTERNATIVES),
    };
  }

  return {
    disease: topDisease,
    confidence: topConfidence,
    severity: coerceSeverity(record.severity),
    treatmentSteps: coerceStringArray(record.treatmentSteps),
    preventionTips: coerceStringArray(record.preventionTips),
    alternatives: remaining.slice(0, MAX_ALTERNATIVES),
  };
}
