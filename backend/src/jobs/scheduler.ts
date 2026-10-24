import { schedule } from 'node-cron';
import { Types } from 'mongoose';
import { isDBConnected } from '../config/db';
import { CropListing } from '../modules/crop-listing/cropListing.model';
import { BuyerRequirement } from '../modules/buyer-requirements/buyerRequirement.model';
import { Match } from '../modules/matching/matching.model';
import { FarmProfile } from '../modules/users/farmProfile.model';
import { WeatherSnapshot } from '../modules/weather/weatherSnapshot.model';
import { Notification } from '../modules/notifications/notification.model';
import {
  dispatchMatchEvent,
  dispatchNotification,
} from '../modules/notifications/notification.service';
import { refreshCachedCommodities } from '../modules/market-prices/marketPrice.service';
import { refreshCachedSnapshots } from '../modules/weather/weather.service';
import { detectSevereAlerts } from '../services/weather.service';

/** A listing that has sat `active` for this long with no interest is considered stale. */
const LISTING_STALE_DAYS = 30;

const tasks: ReturnType<typeof schedule>[] = [];
let started = false;

function daysAgo(days: number, now: Date): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

/** `active` listings older than the stale window are marked `expired`. */
export async function expireStaleListings(now: Date = new Date()): Promise<number> {
  const result = await CropListing.updateMany(
    {
      status: 'active',
      isDeleted: { $ne: true },
      createdAt: { $lt: daysAgo(LISTING_STALE_DAYS, now) },
    },
    { $set: { status: 'expired' } }
  );
  return result.modifiedCount;
}

/** `open` requirements whose `requiredByDate` has passed are marked `expired`. */
export async function expireOverdueRequirements(now: Date = new Date()): Promise<number> {
  const result = await BuyerRequirement.updateMany(
    {
      status: 'open',
      isDeleted: { $ne: true },
      requiredByDate: { $lt: now },
    },
    { $set: { status: 'expired' } }
  );
  return result.modifiedCount;
}

/** Undecided matches past `matchExpiresAt` are marked `expired` and both sides notified. */
export async function expireStaleMatches(now: Date = new Date()): Promise<number> {
  const expiring = await Match.find({
    status: { $in: ['suggested', 'pending'] },
    matchExpiresAt: { $lt: now },
  });

  if (expiring.length === 0) return 0;

  await Match.updateMany(
    { _id: { $in: expiring.map((match) => match._id) } },
    { $set: { status: 'expired' } }
  );

  for (const match of expiring) {
    await dispatchMatchEvent([match.farmerId, match.buyerId], 'match:expired', {
      matchId: match._id?.toString(),
      cropName: match.cropName,
      status: 'expired',
      overallScore: match.scores?.overallScore,
    });
  }

  return expiring.length;
}

/** Caps one sweep so a large profile table cannot stall the process. */
const MAX_ALERT_DISTRICTS = 50;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function startOfDay(now: Date): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Pushes severe-weather alerts to farmers who actually have a farm profile in
 * an affected district. Scoped to districts someone farms in rather than every
 * cached snapshot, so an alert is actionable instead of broadcast to a district
 * where nobody in the app grows anything.
 *
 * Returns the number of alerts dispatched.
 */
export async function dispatchSevereWeatherAlerts(
  now: Date = new Date()
): Promise<number> {
  const profiles = await FarmProfile.find({ isActive: true })
    .select('farmerId district state')
    .lean();

  if (profiles.length === 0) return 0;

  // Group farmers by district+state so one snapshot lookup serves everyone there.
  const byDistrict = new Map<
    string,
    { district: string; state: string; farmerIds: Types.ObjectId[] }
  >();

  for (const profile of profiles) {
    const district = (profile.district ?? '').trim();
    const state = (profile.state ?? '').trim();
    if (!district || !state) continue;

    const key = `${district.toLowerCase()}|${state.toLowerCase()}`;
    const entry = byDistrict.get(key) ?? { district, state, farmerIds: [] };
    entry.farmerIds.push(profile.farmerId);
    byDistrict.set(key, entry);
  }

  const today = startOfDay(now);
  let sent = 0;

  for (const entry of [...byDistrict.values()].slice(0, MAX_ALERT_DISTRICTS)) {
    const snapshot = await WeatherSnapshot.findOne({
      district: { $regex: `^${escapeRegex(entry.district)}$`, $options: 'i' },
      state: { $regex: `^${escapeRegex(entry.state)}$`, $options: 'i' },
    });
    if (!snapshot) continue;

    for (const alert of detectSevereAlerts(snapshot)) {
      // One alert of each kind per district per day. Without this the sweep
      // would re-send the same frost warning on every run.
      const alreadySent = await Notification.exists({
        type: 'weather:alert',
        'data.district': entry.district,
        'data.kind': alert.kind,
        createdAt: { $gte: today },
      });
      if (alreadySent) continue;

      await dispatchNotification(
        entry.farmerIds,
        'weather:alert',
        { district: entry.district, state: entry.state, kind: alert.kind },
        { title: alert.title, body: alert.body }
      );
      sent += 1;
    }
  }

  return sent;
}

async function runAllJobs(): Promise<void> {
  // Without a connection every query sits in Mongoose's buffer and only rejects
  // 10s later, so a DB outage would fill the log with buffering timeouts.
  if (!isDBConnected) return;

  const jobs: Array<[string, () => Promise<number>]> = [
    ['listings', () => expireStaleListings()],
    ['requirements', () => expireOverdueRequirements()],
    ['matches', () => expireStaleMatches()],
  ];

  for (const [name, run] of jobs) {
    try {
      const count = await run();
      if (count > 0) console.log(`[cron] expired ${count} stale ${name}`);
    } catch (error) {
      // A failed sweep must never take the process down.
      console.error(`[cron] ${name} sweep failed:`, error);
    }
  }
}

/**
 * Runs one cache-refresh sweep. Provider failures are logged, never thrown, so
 * a missing or malformed upstream response cannot take the process down.
 */
async function runRefresh(
  name: string,
  refresh: () => Promise<number>
): Promise<void> {
  // Same reason as runAllJobs: every one of these reads or writes the database.
  if (!isDBConnected) return;

  try {
    const count = await refresh();
    if (count > 0) console.log(`[cron] refreshed ${count} cached ${name}`);
  } catch (error) {
    console.error(`[cron] ${name} refresh failed:`, error);
  }
}

/**
 * Schedules the housekeeping sweeps. Each job is isolated so one failure cannot
 * break the others, and the whole set runs once on boot then every 15 minutes.
 */
export function startScheduledJobs(): void {
  if (started) return;
  started = true;

  tasks.push(
    schedule('*/15 * * * *', () => {
      void runAllJobs();
    })
  );

  tasks.push(
    schedule('30 6 * * *', () => {
      void runRefresh('market prices', refreshCachedCommodities);
    })
  );

  tasks.push(
    schedule('0 */3 * * *', () => {
      void runRefresh('weather snapshots', refreshCachedSnapshots);
    })
  );

  // Offset from the snapshot refresh above so the alerts read a snapshot that
  // has already been brought up to date in this cycle.
  tasks.push(
    schedule('30 */3 * * *', () => {
      void runRefresh('weather alerts dispatched', dispatchSevereWeatherAlerts);
    })
  );

  void runAllJobs();
}

export function stopScheduledJobs(): void {
  for (const task of tasks) task.stop();
  tasks.length = 0;
  started = false;
}
