import { env } from '../config/env';
import { createHttpError, fetchJson } from '../utils/http';

export interface WeatherProviderResult {
  lat: number;
  lng: number;
  current: { tempC: number; humidity: number; windKph: number; condition: string };
  forecast: Array<{
    date: Date;
    tempMinC: number;
    tempMaxC: number;
    rainMm: number;
    condition: string;
  }>;
  source: string;
}

const PLACEHOLDER_KEY = 'your_openweathermap_api_key';
const MAX_FORECAST_DAYS = 5;

interface GeoResult {
  lat: number;
  lon: number;
}

interface OwmForecastEntry {
  dt: number;
  main: { temp: number; temp_min: number; temp_max: number; humidity: number };
  weather: Array<{ main: string }>;
  wind: { speed: number };
  rain?: { '3h'?: number };
}

interface OwmForecastResponse {
  city?: { timezone?: number };
  list?: OwmForecastEntry[];
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function geocodingBase(baseUrl: string): string {
  return baseUrl.replace(/\/data\/2\.5\/?$/, '/geo/1.0');
}

function mostFrequentCondition(entries: OwmForecastEntry[]): string {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const condition = entry.weather?.[0]?.main;
    if (!condition) continue;
    counts.set(condition, (counts.get(condition) ?? 0) + 1);
  }

  let best = 'Unknown';
  let bestCount = -1;
  for (const [condition, count] of counts) {
    if (count > bestCount) {
      best = condition;
      bestCount = count;
    }
  }
  return best;
}

export async function fetchWeather(input: {
  district: string;
  state: string;
}): Promise<WeatherProviderResult> {
  const apiKey = env.WEATHER_API_KEY;

  if (!apiKey || apiKey === PLACEHOLDER_KEY) {
    throw createHttpError(
      'Weather data is not configured. Set WEATHER_API_KEY.',
      503,
      'PROVIDER_NOT_CONFIGURED'
    );
  }

  const query = `${input.district},${input.state},IN`;
  const geoUrl = `${geocodingBase(env.WEATHER_API_BASE_URL)}/direct?q=${encodeURIComponent(
    query
  )}&limit=1&appid=${encodeURIComponent(apiKey)}`;

  const geoMatches = await fetchJson<GeoResult[]>(geoUrl, { timeoutMs: 8000 });
  const match = Array.isArray(geoMatches) ? geoMatches[0] : undefined;

  if (
    !match ||
    typeof match.lat !== 'number' ||
    typeof match.lon !== 'number'
  ) {
    throw createHttpError(
      'Could not resolve this district/state',
      404,
      'LOCATION_NOT_FOUND'
    );
  }

  const { lat, lon: lng } = match;
  const forecastUrl = `${env.WEATHER_API_BASE_URL}/forecast?lat=${lat}&lon=${lng}&appid=${encodeURIComponent(
    apiKey
  )}&units=metric`;

  const data = await fetchJson<OwmForecastResponse>(forecastUrl, {
    timeoutMs: 8000,
  });
  const list = Array.isArray(data.list) ? data.list : [];

  if (list.length === 0) {
    throw createHttpError(
      'Weather provider returned no forecast data',
      502,
      'PROVIDER_UNAVAILABLE'
    );
  }

  const offsetSeconds =
    typeof data.city?.timezone === 'number' ? data.city.timezone : 0;

  // OWM reports 3-hourly steps in UTC; shifting by the city offset yields the
  // local calendar date the farmer actually experiences.
  const groups = new Map<string, OwmForecastEntry[]>();
  for (const entry of list) {
    if (!entry || typeof entry.dt !== 'number') continue;
    const localDate = new Date((entry.dt + offsetSeconds) * 1000)
      .toISOString()
      .slice(0, 10);
    const bucket = groups.get(localDate) ?? [];
    bucket.push(entry);
    groups.set(localDate, bucket);
  }

  const forecast = [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(0, MAX_FORECAST_DAYS)
    .map(([dateKey, entries]) => {
      const minTemps = entries
        .map((entry) => entry.main?.temp_min)
        .filter((value): value is number => typeof value === 'number');
      const maxTemps = entries
        .map((entry) => entry.main?.temp_max)
        .filter((value): value is number => typeof value === 'number');
      const rainMm = entries.reduce(
        (sum, entry) => sum + (entry.rain?.['3h'] ?? 0),
        0
      );

      return {
        date: new Date(`${dateKey}T00:00:00.000Z`),
        tempMinC: minTemps.length > 0 ? round1(Math.min(...minTemps)) : 0,
        tempMaxC: maxTemps.length > 0 ? round1(Math.max(...maxTemps)) : 0,
        rainMm: round1(rainMm),
        condition: mostFrequentCondition(entries),
      };
    });

  const first = list[0];

  return {
    lat,
    lng,
    current: {
      tempC: round1(first.main?.temp ?? 0),
      humidity: Math.round(first.main?.humidity ?? 0),
      windKph: round1((first.wind?.speed ?? 0) * 3.6),
      condition: first.weather?.[0]?.main ?? 'Unknown',
    },
    forecast,
    source: 'openweathermap',
  };
}

export interface SevereWeatherAlert {
  kind: 'frost' | 'heatwave' | 'heavy_rain' | 'storm';
  title: string;
  body: string;
}

// Deliberately higher than the thresholds in `buildAdvisories` (which uses 2mm
// of rain and 38°C). Advice is shown whenever a farmer opens the weather page;
// these trigger a push, so ordinary weather must not qualify.
const FROST_TEMP_C = 4;
const HEATWAVE_TEMP_C = 40;
const HEAVY_RAIN_MM = 30;

function dayLabel(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Detects weather severe enough to interrupt a farmer's day, as opposed to the
 * routine advice returned by `buildAdvisories`.
 *
 * Hailstorm is listed in the PRD but OpenWeatherMap exposes no hail signal, so
 * a thunderstorm is reported as `storm` rather than being mislabelled as hail.
 */
export function detectSevereAlerts(
  result: Pick<WeatherProviderResult, 'current' | 'forecast'>
): SevereWeatherAlert[] {
  const { forecast } = result;
  const alerts: SevereWeatherAlert[] = [];

  const frostDay = forecast.find((day) => day.tempMinC <= FROST_TEMP_C);
  if (frostDay) {
    alerts.push({
      kind: 'frost',
      title: 'Frost warning',
      body: `Low of ${round1(frostDay.tempMinC)}C on ${dayLabel(frostDay.date)}. Protect young and sensitive crops overnight.`,
    });
  }

  const heatDay = forecast.find((day) => day.tempMaxC >= HEATWAVE_TEMP_C);
  if (heatDay) {
    alerts.push({
      kind: 'heatwave',
      title: 'Heatwave warning',
      body: `High of ${round1(heatDay.tempMaxC)}C on ${dayLabel(heatDay.date)}. Irrigate early morning and mulch to hold soil moisture.`,
    });
  }

  const rainDay = forecast.find((day) => day.rainMm >= HEAVY_RAIN_MM);
  if (rainDay) {
    alerts.push({
      kind: 'heavy_rain',
      title: 'Heavy rain warning',
      body: `About ${round1(rainDay.rainMm)}mm expected on ${dayLabel(rainDay.date)}. Harvest what you can and secure stored produce.`,
    });
  }

  const stormyDay = forecast.find((day) =>
    day.condition.toLowerCase().includes('thunderstorm')
  );
  if (stormyDay) {
    alerts.push({
      kind: 'storm',
      title: 'Thunderstorm warning',
      body: `Thunderstorms expected on ${dayLabel(stormyDay.date)}. Avoid spraying and do not work in open fields.`,
    });
  }

  return alerts;
}

export function buildAdvisories(
  result: Pick<WeatherProviderResult, 'current' | 'forecast'>
): string[] {
  const { current, forecast } = result;
  const advisories: string[] = [];

  // The first daily bucket is the best available proxy for the next 24 hours.
  const next24hRain = forecast[0]?.rainMm ?? 0;

  if (next24hRain >= 10) {
    advisories.push('Heavy rain expected — delay irrigation and avoid spraying.');
  } else if (next24hRain >= 2) {
    advisories.push("Light rain expected — you can skip today's irrigation.");
  }

  if (forecast.some((day) => day.tempMaxC >= 38)) {
    advisories.push(
      'Heat stress risk — irrigate early morning and mulch to retain soil moisture.'
    );
  }

  if (forecast.some((day) => day.tempMinC <= 8)) {
    advisories.push('Cold nights ahead — protect young seedlings and sensitive crops.');
  }

  if (current.humidity >= 85) {
    advisories.push(
      'High humidity — elevated fungal disease risk; inspect leaves and avoid overhead watering.'
    );
  }

  if (current.windKph >= 25) {
    advisories.push('Strong winds — do not spray pesticides or herbicides today.');
  }

  if (current.windKph < 12 && next24hRain < 2) {
    advisories.push('Good conditions for spraying today.');
  }

  if (forecast.length > 0 && forecast.every((day) => day.rainMm <= 0)) {
    advisories.push('Dry spell ahead — plan irrigation for the next few days.');
  }

  if (advisories.length === 0) {
    advisories.push('Conditions look favourable — continue your regular crop care.');
  }

  return advisories.slice(0, 6);
}
