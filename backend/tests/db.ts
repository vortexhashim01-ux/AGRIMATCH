import './testEnv';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let memoryServer: MongoMemoryServer | undefined;

/**
 * Boots a throwaway in-process MongoDB and points mongoose at it. Nothing here
 * touches a real cluster: the URI comes from the spawned server, and the
 * database is dropped on teardown.
 */
export async function startTestDB(): Promise<void> {
  memoryServer = await MongoMemoryServer.create({
    instance: {
      // mongod does start here, but its launch time on this Windows box swings
      // from ~2s to ~15s and occasionally past a minute (antivirus scanning the
      // ~100MB binary, cold disk). Measured, not guessed: a debug run showed a
      // healthy 15s boot. The 10s default and even 60s therefore fail the whole
      // suite for no real reason, so the ceiling is deliberately generous.
      launchTimeout: 180_000,
      // mongod defaults its WiredTiger cache to half of system RAM (~7.5GB
      // here), which is absurd for a throwaway test database.
      args: ['--wiredTigerCacheSizeGB', '0.25'],
    },
  });
  await mongoose.connect(memoryServer.getUri(), { dbName: 'agrimatch_test' });
}

export async function stopTestDB(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
  await memoryServer?.stop();
  memoryServer = undefined;
}

/** Empties every collection so each test starts from a known state. */
export async function clearTestDB(): Promise<void> {
  const db = mongoose.connection.db;
  if (!db) return;
  const collections = await db.collections();
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
}
