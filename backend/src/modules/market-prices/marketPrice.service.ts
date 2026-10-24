import { MandiPrice, IMandiPrice } from './mandiPrice.model';
import { MarketPriceQuery } from './marketPrice.schema';
import { fetchAgmarknetPrices } from '../../services/marketData.service';

const MAX_CACHE_AGE_MS = 6 * 60 * 60 * 1000;
const MAX_REFRESH_COMMODITIES = 10;
const ROW_LIMIT = 500;

export interface MarketPriceMandis {
  mandiName: string;
  district: string;
  state: string;
  minPrice: number;
  modalPrice: number;
  maxPrice: number;
  priceDate: Date;
}

export interface MarketPriceTrendPoint {
  date: string;
  modalPrice: number;
}

export interface MarketPriceResponse {
  commodity: string;
  unit: 'quintal';
  source: 'agmarknet';
  cached: boolean;
  fetchedAt: Date;
  mandis: MarketPriceMandis[];
  trend: MarketPriceTrendPoint[];
}

interface CommodityFilterInput {
  commodity: string;
  state?: string;
  district?: string;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function commodityFilter(commodity: string): Record<string, unknown> {
  return {
    commodity: { $regex: `^${escapeRegex(commodity.trim())}$`, $options: 'i' },
  };
}

function locationFilter(input: CommodityFilterInput): Record<string, unknown> {
  const filter: Record<string, unknown> = {};
  if (input.state) {
    filter.state = { $regex: escapeRegex(input.state.trim()), $options: 'i' };
  }
  if (input.district) {
    filter.district = { $regex: escapeRegex(input.district.trim()), $options: 'i' };
  }
  return filter;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function windowStart(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

async function loadWindowRows(
  filter: Record<string, unknown>,
  days: number
): Promise<IMandiPrice[]> {
  const rows = await MandiPrice.find({
    ...filter,
    priceDate: { $gte: windowStart(days) },
  })
    .sort({ priceDate: -1, modalPricePerQuintal: -1 })
    .limit(ROW_LIMIT)
    .lean();

  return rows as unknown as IMandiPrice[];
}

function buildResponse(
  query: MarketPriceQuery,
  rows: IMandiPrice[],
  cached: boolean,
  fetchedAt: Date
): MarketPriceResponse {
  const cutoff = windowStart(query.days).getTime();
  const inWindow = rows.filter(
    (row) => new Date(row.priceDate).getTime() >= cutoff
  );

  const mandis: MarketPriceMandis[] = [...inWindow]
    .sort(
      (a, b) =>
        new Date(b.priceDate).getTime() - new Date(a.priceDate).getTime() ||
        b.modalPricePerQuintal - a.modalPricePerQuintal
    )
    .map((row) => ({
      mandiName: row.mandiName,
      district: row.district,
      state: row.state,
      minPrice: row.minPricePerQuintal,
      modalPrice: row.modalPricePerQuintal,
      maxPrice: row.maxPricePerQuintal,
      priceDate: row.priceDate,
    }));

  const grouped = new Map<string, { sum: number; count: number }>();
  for (const row of inWindow) {
    const key = dateKey(new Date(row.priceDate));
    const agg = grouped.get(key) ?? { sum: 0, count: 0 };
    agg.sum += row.modalPricePerQuintal;
    agg.count += 1;
    grouped.set(key, agg);
  }

  const trend: MarketPriceTrendPoint[] = [...grouped.entries()]
    .map(([date, agg]) => ({ date, modalPrice: round2(agg.sum / agg.count) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    commodity: query.commodity.trim(),
    unit: 'quintal',
    source: 'agmarknet',
    cached,
    fetchedAt,
    mandis,
    trend,
  };
}

export async function getMarketPrices(
  query: MarketPriceQuery
): Promise<MarketPriceResponse> {
  const filter = { ...commodityFilter(query.commodity), ...locationFilter(query) };

  const newest = await MandiPrice.findOne(filter)
    .sort({ fetchedAt: -1 })
    .select('fetchedAt');

  if (newest && Date.now() - new Date(newest.fetchedAt).getTime() < MAX_CACHE_AGE_MS) {
    const rows = await loadWindowRows(filter, query.days);
    return buildResponse(query, rows, true, newest.fetchedAt);
  }

  try {
    const refreshed = await refreshCommodity(query);
    return buildResponse(query, refreshed, false, new Date());
  } catch (error) {
    // A provider outage must not take down a request we can still answer from
    // an older snapshot of the feed.
    if (newest) {
      const rows = await loadWindowRows(filter, query.days);
      if (rows.length > 0) {
        return buildResponse(query, rows, true, newest.fetchedAt);
      }
    }
    throw error;
  }
}

export async function refreshCommodity(
  input: CommodityFilterInput
): Promise<IMandiPrice[]> {
  const quotes = await fetchAgmarknetPrices({
    commodity: input.commodity.trim(),
    state: input.state,
    district: input.district,
  });

  const fetchedAt = new Date();

  if (quotes.length > 0) {
    await MandiPrice.bulkWrite(
      quotes.map((quote) => ({
        updateOne: {
          filter: {
            commodity: quote.commodity,
            mandiName: quote.mandiName,
            district: quote.district,
            state: quote.state,
            priceDate: quote.priceDate,
          },
          update: {
            $set: { ...quote, source: 'agmarknet', fetchedAt },
          },
          upsert: true,
        },
      }))
    );
  }

  return quotes.map((quote) => ({
    commodity: quote.commodity,
    mandiName: quote.mandiName,
    district: quote.district,
    state: quote.state,
    minPricePerQuintal: quote.minPricePerQuintal,
    modalPricePerQuintal: quote.modalPricePerQuintal,
    maxPricePerQuintal: quote.maxPricePerQuintal,
    priceDate: quote.priceDate,
    source: 'agmarknet',
    fetchedAt,
  }));
}

export async function refreshCachedCommodities(): Promise<number> {
  const commodities = await MandiPrice.distinct('commodity');
  const targets = commodities
    .filter((commodity): commodity is string => typeof commodity === 'string' && commodity.trim().length > 0)
    .slice(0, MAX_REFRESH_COMMODITIES);

  let succeeded = 0;
  for (const commodity of targets) {
    try {
      await refreshCommodity({ commodity });
      succeeded += 1;
    } catch (error) {
      console.error(`[cron] market price refresh failed for ${commodity}:`, error);
    }
  }

  return succeeded;
}

/** A recent mandi quote expressed per kilogram, for revenue calculations. */
export interface LiveMandiPrice {
  pricePerKg: number;
  pricePerQuintal: number;
  commodity: string;
  mandiName: string;
  district: string;
  state: string;
  priceDate: Date;
}

/** Quotes older than this are treated as no quote at all. */
const LIVE_PRICE_MAX_AGE_DAYS = 14;

const QUINTAL_IN_KG = 100;

/**
 * Finds the most recent cached mandi quote for any of `commodityNames`.
 *
 * The knowledge base names crops differently from Agmarknet ("Mirchi (Chilli)"
 * vs "Chilli", "Soybean" vs "Soyabean"), so several candidate spellings are
 * tried: an anchored match first, then a substring match, each against the
 * farmer's own district before widening to the state. Returns null when nothing
 * recent matches — the caller falls back to the knowledge-base price rather
 * than silently reporting an invented one.
 *
 * Reads only the local cache, so this is a database lookup and never a network
 * call on the request path.
 */
export async function findLiveMandiPrice(input: {
  commodityNames: string[];
  state: string;
  district?: string;
  maxAgeDays?: number;
}): Promise<LiveMandiPrice | null> {
  const names = [...new Set(input.commodityNames.map((n) => n.trim()))].filter(
    Boolean
  );
  if (names.length === 0 || !input.state.trim()) return null;

  const since = windowStart(input.maxAgeDays ?? LIVE_PRICE_MAX_AGE_DAYS);

  const locationAttempts: Record<string, unknown>[] = [];
  if (input.district?.trim()) {
    locationAttempts.push({
      state: { $regex: escapeRegex(input.state.trim()), $options: 'i' },
      district: { $regex: escapeRegex(input.district.trim()), $options: 'i' },
    });
  }
  locationAttempts.push({
    state: { $regex: escapeRegex(input.state.trim()), $options: 'i' },
  });

  for (const location of locationAttempts) {
    for (const anchored of [true, false]) {
      const row = await MandiPrice.findOne({
        $and: [
          {
            $or: names.map((name) => ({
              commodity: {
                $regex: anchored
                  ? `^${escapeRegex(name)}$`
                  : escapeRegex(name),
                $options: 'i',
              },
            })),
          },
          location,
          { priceDate: { $gte: since } },
        ],
      })
        .sort({ priceDate: -1, modalPricePerQuintal: -1 })
        .lean();

      if (row) {
        return {
          pricePerKg: round2(row.modalPricePerQuintal / QUINTAL_IN_KG),
          pricePerQuintal: row.modalPricePerQuintal,
          commodity: row.commodity,
          mandiName: row.mandiName,
          district: row.district,
          state: row.state,
          priceDate: row.priceDate,
        };
      }
    }
  }

  return null;
}
