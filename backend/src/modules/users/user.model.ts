import { Schema, model, Types } from 'mongoose';

export type UserRole = 'farmer' | 'buyer' | 'admin';
export type Language = 'en' | 'hi' | 'ta' | 'bn';

export type ThemeMode = 'light' | 'dark' | 'system';

/**
 * Curated accent presets (AgriMatch PRD §2). The client may only pick one of
 * these, so an arbitrary hex can never reach the database and break contrast.
 */
export const ACCENT_PRESETS = [
  '#13db0f',
  '#0ea5e9',
  '#6366f1',
  '#8b5cf6',
  '#f43f5e',
  '#f59e0b',
  '#14b8a6',
  '#64748b',
] as const;

export type AccentColor = (typeof ACCENT_PRESETS)[number];

export interface IUserPreferences {
  themeMode: ThemeMode;
  accentColor: AccentColor;
  largeText: boolean;
}

export const DEFAULT_USER_PREFERENCES: IUserPreferences = {
  themeMode: 'system',
  accentColor: '#13db0f',
  largeText: false,
};

export interface IUser {
  _id: Types.ObjectId;
  fullName: string;
  email?: string;
  phone?: string;
  role: UserRole;
  passwordHash?: string;
  refreshTokenHash?: string | null;
  isActive: boolean;
  isVerified: boolean;
  language: Language;
  preferences: IUserPreferences;
  lastLoginAt: Date | null;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    email: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    },
    phone: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      match: [/^\+?[1-9]\d{1,14}$/, 'Please provide a valid phone number (E.164)'],
    },
    role: {
      type: String,
      enum: ['farmer', 'buyer', 'admin'],
      required: true,
    },
    passwordHash: {
      type: String,
    },
    refreshTokenHash: {
      type: String,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    language: {
      type: String,
      enum: ['en', 'hi', 'ta', 'bn'],
      default: 'en',
    },
    preferences: {
      themeMode: {
        type: String,
        enum: ['light', 'dark', 'system'],
        default: 'system',
      },
      accentColor: {
        type: String,
        enum: [...ACCENT_PRESETS],
        default: '#13db0f',
      },
      largeText: {
        type: Boolean,
        default: false,
      },
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
    // Set when the account is anonymised by the deletion flow (PRD §12). A
    // merely deactivated account leaves this null, so the two are distinguishable.
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

userSchema.index({ role: 1 });
userSchema.index({ createdAt: -1 });

export const User = model<IUser>('User', userSchema);
