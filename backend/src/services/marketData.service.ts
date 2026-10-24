import { env } from '../config/env';
import { createHttpError, fetchJson } from '../utils/http';

export interface AgmarknetQuote {
  commodity: string;
  mandiName: string;
  district: string;
  state: string;
  minPricePerQuintal: number;
  modalPricePerQuintal: number;
  maxPricePerQuintal: number;
  priceDate: Date;
}

interface DataGovResponse {
  records?: Array<Record<string, unknown>>;
}

const PLACEHOLDER_KEY = 'your_data_gov_in_api_key';
const DATA_GOV_BASE = 'https://api.data.gov.in/resource';

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function parsePrice(value: unknown): number | null {
  const numeric =
    typeof value === 'number'
      ? value
      : Number(asString(value).replace(/,/g, ''));
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return numeric;
}

function parseArrivalDate(value: unknown): Date | null {
  const raw = asString(value);
  if (!raw) return null;

  const dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmy) {
    const parsed = new Date(
      Date.UTC(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]))
    );
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const fallback = new Date(raw);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

export async function fetchAgmarknetPrices(filters: {
  commodity: string;
  state?: string;
  district?: string;
}): Promise<AgmarknetQuote[]> {
  const apiKey = env.AGMARKNET_API_KEY;

  if (!apiKey || apiKey === PLACEHOLDER_KEY) {
    throw createHttpError(
      'Mandi price data is not configured. Set AGMARKNET_API_KEY.',
      503,
      'PROVIDER_NOT_CONFIGURED'
    );
  }

  const params = new URLSearchParams();
  params.set('api-key', apiKey);
  params.set('format', 'json');
  params.set('limit', '500');
  params.set('filters[commodity]', filters.commodity);
  if (filters.state) params.set('filters[state]', filters.state);
  if (filters.district) params.set('filters[district]', filters.district);

  const url = `${DATA_GOV_BASE}/${encodeURIComponent(env.AGMARKNET_RESOURCE_ID)}?${params.toString()}`;

  const payload = await fetchJson<DataGovResponse>(url, { timeoutMs: 8000 });
  const records = Array.isArray(payload.records) ? payload.records : [];

  const quotes: AgmarknetQuote[] = [];
  for (const record of records) {
    const commodity = asString(record.commodity);
    const mandiName = asString(record.market);
    const district = asString(record.district);
    const state = asString(record.state);
    const min = parsePrice(record.min_price);
    const modal = parsePrice(record.modal_price);
    const max = parsePrice(record.max_price);
    const priceDate = parseArrivalDate(record.arrival_date);

    // Drop anything we cannot faithfully represent rather than storing a zero.
    if (!commodity || !mandiName || !priceDate) continue;
    if (min === null || modal === null || max === null) continue;

    quotes.push({
      commodity,
      mandiName,
      district,
      state,
      minPricePerQuintal: min,
      modalPricePerQuintal: modal,
      maxPricePerQuintal: max,
      priceDate,
    });
  }

  return quotes;
}
