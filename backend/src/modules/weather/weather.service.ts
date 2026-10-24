import { WeatherSnapshot, IWeatherSnapshot } from './weatherSnapshot.model';
import { WeatherQuery } from './weather.schema';
import {
  buildAdvisories,
  fetchWeather,
} from '../../services/weather.service';

const MAX_CACHE_AGE_MS = 3 * 60 * 60 * 1000;
const MAX_REFRESH_SNAPSHOTS = 20;

export interface WeatherResponse {
  district: string;
  state: string;
  current: IWeatherSnapshot['current'];
  forecast: IWeatherSnapshot['forecast'];
  advisories: string[];
  source: string;
  cached: boolean;
  fetchedAt: Date;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function locationFilter(query: WeatherQuery): Record<string, unknown> {
  return {
    district: { $regex: `^${escapeRegex(query.district.trim())}$`, $options: 'i' },
    state: { $regex: `^${escapeRegex(query.state.trim())}$`, $options: 'i' },
  };
}

function buildResponse(
  snapshot: IWeatherSnapshot,
  cached: boolean
): WeatherResponse {
  return {
    district: snapshot.district,
    state: snapshot.state,
    current: snapshot.current,
    forecast: snapshot.forecast,
    advisories: snapshot.advisories,
    source: snapshot.source,
    cached,
    fetchedAt: snapshot.fetchedAt,
  };
}

export async function getWeather(query: WeatherQuery): Promise<WeatherResponse> {
  const filter = locationFilter(query);

  const existing = await WeatherSnapshot.findOne(filter).sort({ fetchedAt: -1 });

  if (
    existing &&
    Date.now() - new Date(existing.fetchedAt).getTime() < MAX_CACHE_AGE_MS
  ) {
    return buildResponse(existing, true);
  }

  try {
    const provider = await fetchWeather({
      district: query.district.trim(),
      state: query.state.trim(),
    });
    const advisories = buildAdvisories(provider);

    const snapshot = await WeatherSnapshot.findOneAndUpdate(
      filter,
      {
        $set: {
          district: query.district.trim(),
          state: query.state.trim(),
          lat: provider.lat,
          lng: provider.lng,
          current: provider.current,
          forecast: provider.forecast,
          advisories,
          source: provider.source,
          fetchedAt: new Date(),
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return buildResponse(snapshot, false);
  } catch (error) {
    // Serve the last good snapshot rather than failing when the provider is down.
    if (existing) return buildResponse(existing, true);
    throw error;
  }
}

export async function refreshCachedSnapshots(): Promise<number> {
  const snapshots = await WeatherSnapshot.find()
    .sort({ fetchedAt: 1 })
    .limit(MAX_REFRESH_SNAPSHOTS);

  let succeeded = 0;
  for (const snapshot of snapshots) {
    try {
      const provider = await fetchWeather({
        district: snapshot.district,
        state: snapshot.state,
      });

      snapshot.lat = provider.lat;
      snapshot.lng = provider.lng;
      snapshot.current = provider.current;
      snapshot.forecast = provider.forecast;
      snapshot.advisories = buildAdvisories(provider);
      snapshot.source = provider.source;
      snapshot.fetchedAt = new Date();

      await snapshot.save();
      succeeded += 1;
    } catch (error) {
      console.error(
        `[cron] weather refresh failed for ${snapshot.district}, ${snapshot.state}:`,
        error
      );
    }
  }

  return succeeded;
}
