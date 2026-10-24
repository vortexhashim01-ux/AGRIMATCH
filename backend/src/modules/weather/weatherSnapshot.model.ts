import { Schema, model, Types } from 'mongoose';

export interface IWeatherCurrent {
  tempC: number;
  humidity: number;
  windKph: number;
  condition: string;
}

export interface IWeatherForecastDay {
  date: Date;
  tempMinC: number;
  tempMaxC: number;
  rainMm: number;
  condition: string;
}

export interface IWeatherSnapshot {
  _id?: Types.ObjectId;
  district: string;
  state: string;
  lat: number;
  lng: number;
  current: IWeatherCurrent;
  forecast: IWeatherForecastDay[];
  advisories: string[];
  source: string;
  fetchedAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const currentSchema = new Schema<IWeatherCurrent>(
  {
    tempC: { type: Number, required: true },
    humidity: { type: Number, required: true },
    windKph: { type: Number, required: true },
    condition: { type: String, required: true },
  },
  { _id: false }
);

const forecastDaySchema = new Schema<IWeatherForecastDay>(
  {
    date: { type: Date, required: true },
    tempMinC: { type: Number, required: true },
    tempMaxC: { type: Number, required: true },
    rainMm: { type: Number, required: true },
    condition: { type: String, required: true },
  },
  { _id: false }
);

const weatherSnapshotSchema = new Schema<IWeatherSnapshot>(
  {
    district: { type: String, required: true, trim: true, index: true },
    state: { type: String, required: true, trim: true, index: true },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    current: { type: currentSchema, required: true },
    forecast: { type: [forecastDaySchema], default: [] },
    advisories: { type: [String], default: [] },
    source: { type: String, default: 'openweathermap' },
    fetchedAt: { type: Date, required: true },
  },
  { timestamps: true }
);

weatherSnapshotSchema.index({ district: 1, state: 1 }, { unique: true });

export const WeatherSnapshot = model<IWeatherSnapshot>(
  'WeatherSnapshot',
  weatherSnapshotSchema
);
