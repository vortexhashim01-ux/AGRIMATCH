import mongoose from 'mongoose';
import { env } from './env';

export let isDBConnected = false;

export async function connectDB(retries = 5, delayMs = 3000) {
  let attempt = 0;
  let lastError: unknown = null;

  mongoose.connection.on('connected', () => {
    isDBConnected = true;
    console.log(`✅ MongoDB Connected: ${mongoose.connection.host}`);
  });

  mongoose.connection.on('disconnected', () => {
    isDBConnected = false;
    console.warn('⚠️  MongoDB Disconnected');
  });

  mongoose.connection.on('error', (err) => {
    console.error('❌ MongoDB connection error:', err.message);
  });

  while (attempt < retries) {
    try {
      attempt++;
      const conn = await mongoose.connect(env.MONGODB_URI, {
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 10000,
      });
      return conn;
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        console.warn(`⚠️  MongoDB connect attempt ${attempt}/${retries} failed. Retrying in ${delayMs / 1000}s...`);
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }

  console.error('❌ MongoDB connection failed after retries:', (lastError as Error).message);
  console.warn('🛠️  Server will start without DB. Health endpoint will reflect DB status.');
  isDBConnected = false;
  return null;
}

export async function disconnectDB() {
  try {
    await mongoose.disconnect();
    console.log('✅ MongoDB Disconnected');
  } catch (error) {
    console.error('❌ MongoDB disconnection error:', error);
  }
}
