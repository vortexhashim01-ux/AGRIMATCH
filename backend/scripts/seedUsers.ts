/**
 * Seeds one farmer, one buyer and one admin straight into MongoDB so the API can
 * be exercised from Postman via `POST /auth/login/password` — no OTP round-trip.
 *
 * Admins are seeded here because `POST /auth/register` only accepts the farmer
 * and buyer roles, so the public API cannot create one.
 *
 * Idempotent: re-running updates the existing accounts instead of duplicating.
 *
 *   npx ts-node scripts/seedUsers.ts
 */
import bcrypt from 'bcryptjs';
import { connectDB, disconnectDB } from '../src/config/db';
import { User, UserRole } from '../src/modules/users/user.model';

// Matches the cost used by auth.service so seeded logins behave like real ones.
const PASSWORD_SALT_ROUNDS = 12;

interface SeedAccount {
  fullName: string;
  email: string;
  phone: string;
  role: UserRole;
  password: string;
}

const ACCOUNTS: SeedAccount[] = [
  {
    fullName: 'Ravi Kumar',
    email: 'farmer@agrimatch.test',
    phone: '+919876543210',
    role: 'farmer',
    password: 'Farmer@123',
  },
  {
    fullName: 'Sunrise Traders',
    email: 'buyer@agrimatch.test',
    phone: '+919876543211',
    role: 'buyer',
    password: 'Buyer@123',
  },
  {
    fullName: 'Platform Admin',
    email: 'admin@agrimatch.test',
    phone: '+919876543212',
    role: 'admin',
    password: 'Admin@123',
  },
];

async function seed(): Promise<void> {
  const connection = await connectDB();

  if (!connection) {
    console.error(
      '\n❌ Could not reach MongoDB. Check MONGODB_URI and that this machine\'s IP is allowed in Atlas → Network Access.'
    );
    process.exitCode = 1;
    return;
  }

  console.log('\nSeeding test accounts...\n');

  for (const account of ACCOUNTS) {
    const passwordHash = await bcrypt.hash(account.password, PASSWORD_SALT_ROUNDS);

    await User.findOneAndUpdate(
      { phone: account.phone },
      {
        $set: {
          fullName: account.fullName,
          email: account.email,
          phone: account.phone,
          role: account.role,
          passwordHash,
          isActive: true,
          isVerified: true,
          // Revives an account that was anonymised by DELETE /users/me.
          deletedAt: null,
        },
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );

    console.log(
      `✅ ${account.role.padEnd(6)} ${account.phone}   ${account.password}`
    );
  }

  const total = await User.countDocuments();
  console.log(`\nTotal users now in the database: ${total}\n`);
}

seed()
  .catch((error) => {
    console.error('❌ Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDB();
  });
