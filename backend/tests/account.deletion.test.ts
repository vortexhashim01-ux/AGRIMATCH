import './testEnv';
import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import { clearTestDB, startTestDB, stopTestDB } from './db';
import { User } from '../src/modules/users/user.model';
import { CropListing } from '../src/modules/crop-listing/cropListing.model';
import { BuyerRequirement } from '../src/modules/buyer-requirements/buyerRequirement.model';
import { CropHealthScan } from '../src/modules/crop-health/cropHealth.model';
import { FarmProfile } from '../src/modules/users/farmProfile.model';
import { Order } from '../src/modules/orders/order.model';
import { Match } from '../src/modules/matching/matching.model';
import { Notification } from '../src/modules/notifications/notification.model';
import {
  deleteMyAccount,
  exportUserData,
} from '../src/modules/users/user.service';

before(startTestDB);
after(stopTestDB);
beforeEach(clearTestDB);

const SCORES = {
  cropNameFit: 100,
  priceFit: 100,
  quantityFit: 100,
  qualityFit: 100,
  locationFit: 100,
  timelineFit: 100,
  farmerReliabilityFit: 100,
  overallScore: 100,
};

function newId(): Types.ObjectId {
  return new Types.ObjectId();
}

/**
 * A farmer with one of everything, so deletion can be checked field by field.
 */
async function seedFarmer() {
  const farmer = await User.create({
    fullName: 'Ramesh Patil',
    email: 'ramesh@example.com',
    phone: '+919812345678',
    role: 'farmer',
    passwordHash: 'super-secret-hash',
    refreshTokenHash: 'super-secret-refresh',
    isActive: true,
    isVerified: true,
  });

  const buyer = await User.create({
    fullName: 'Anita Sharma',
    email: 'anita@example.com',
    phone: '+919898765432',
    role: 'buyer',
    passwordHash: 'hash',
    isActive: true,
  });

  const listing = await CropListing.create({
    farmerId: farmer._id,
    cropName: 'Potato',
    quantityKg: 1000,
    expectedPricePerKg: 20,
    status: 'active',
    isDeleted: false,
  });

  await BuyerRequirement.create({
    buyerId: buyer._id,
    cropName: 'Potato',
    quantityKg: 500,
    maxPricePerKg: 25,
    requiredByDate: new Date(Date.now() + 86400000),
    status: 'open',
    isDeleted: false,
  });

  await CropHealthScan.create({
    farmerId: farmer._id,
    imageUrl: '/uploads/scans/seed.jpg',
    // A file that does not exist: deletion must stay idempotent about it.
    imageProviderId: 'seed-scan-not-on-disk.jpg',
    disease: 'Late blight',
    confidence: 0.9,
    severity: 'severe',
    treatmentSteps: ['Apply fungicide'],
    preventionTips: ['Rotate crops'],
    alternatives: [],
  });

  await FarmProfile.create({
    farmerId: farmer._id,
    addressLine1: 'Gat No. 42, Nashik Road',
    city: 'Nashik',
    state: 'Maharashtra',
    district: 'Nashik',
    pincode: '422001',
    totalLandArea: 5,
    landUnit: 'acre',
    farmSize: 'small',
    farmingMethod: 'conventional',
  });

  await Notification.create({
    userId: farmer._id,
    type: 'message:new',
    title: 'New message',
    body: 'Hello',
    readAt: null,
  });

  const match = await Match.create({
    cropListingId: listing._id,
    buyerRequirementId: newId(),
    farmerId: farmer._id,
    buyerId: buyer._id,
    cropName: 'Potato',
    status: 'accepted',
    hardFilterPass: true,
    scores: SCORES,
    farmerReliabilityScore: 70,
  });

  const order = await Order.create({
    matchId: match._id,
    farmerId: farmer._id,
    buyerId: buyer._id,
    cropName: 'Potato',
    quantityKg: 500,
    agreedPricePerKg: 22,
    deliveryDate: new Date(Date.now() + 86400000),
    status: 'delivered',
  });

  return { farmer, buyer, listing, match, order };
}

// ─────────────────────────────────────────────────────────────────────────────
// Data export (PRD §12)
// ─────────────────────────────────────────────────────────────────────────────

test('the export includes the data the user owns', async () => {
  const { farmer } = await seedFarmer();

  const data = await exportUserData(farmer._id.toString());

  assert.equal(data.account?.fullName, 'Ramesh Patil');
  assert.equal(data.cropListings.length, 1);
  assert.equal(data.cropHealthScans.length, 1);
  assert.equal(data.farmProfiles.length, 1);
  assert.equal(data.notifications.length, 1);
  assert.equal(data.orders.length, 1);
  assert.equal(data.matches.length, 1);
});

test('the export never contains credential material', async () => {
  const { farmer } = await seedFarmer();

  const data = await exportUserData(farmer._id.toString());

  assert.equal('passwordHash' in (data.account ?? {}), false);
  assert.equal('refreshTokenHash' in (data.account ?? {}), false);
  assert.equal(JSON.stringify(data).includes('super-secret-hash'), false);
  assert.equal(JSON.stringify(data).includes('super-secret-refresh'), false);
});

test('an export is scoped to the requesting user', async () => {
  const { buyer } = await seedFarmer();

  const data = await exportUserData(buyer._id.toString());

  assert.equal(data.cropListings.length, 0, "a buyer owns no crop listings");
  assert.equal(data.buyerRequirements.length, 1);
});

test('exporting an unknown user is a 404', async () => {
  await assert.rejects(
    () => exportUserData(newId().toString()),
    (err: { code?: string; statusCode?: number }) => {
      assert.equal(err.code, 'USER_NOT_FOUND');
      assert.equal(err.statusCode, 404);
      return true;
    }
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Account deletion (PRD §12)
// ─────────────────────────────────────────────────────────────────────────────

test('deletion anonymises the account and frees the unique identifiers', async () => {
  const { farmer } = await seedFarmer();

  await deleteMyAccount(farmer._id.toString());

  const after = await User.findById(farmer._id);

  assert.ok(after);
  assert.equal(after.fullName, 'Deleted user');
  assert.equal(after.email, undefined);
  assert.equal(after.phone, undefined);
  assert.equal(after.passwordHash, undefined);
  assert.equal(after.refreshTokenHash, null);
  assert.equal(after.isActive, false);
  assert.equal(after.isVerified, false);
  assert.ok(after.deletedAt instanceof Date, 'deletedAt must be stamped');
});

test('a freed email address can be registered again', async () => {
  const { farmer } = await seedFarmer();

  await deleteMyAccount(farmer._id.toString());

  // Would throw E11000 if the unique sparse index still held the address.
  const reRegistered = await User.create({
    fullName: 'Ramesh Patil',
    email: 'ramesh@example.com',
    phone: '+919812345678',
    role: 'farmer',
    passwordHash: 'new-hash',
  });

  assert.ok(reRegistered._id);
});

test('deletion removes the private data the user owns', async () => {
  const { farmer, buyer } = await seedFarmer();

  await deleteMyAccount(farmer._id.toString());

  assert.equal(await CropListing.countDocuments({ farmerId: farmer._id }), 0);
  assert.equal(await CropHealthScan.countDocuments({ farmerId: farmer._id }), 0);
  assert.equal(await FarmProfile.countDocuments({ farmerId: farmer._id }), 0);
  assert.equal(await Notification.countDocuments({ userId: farmer._id }), 0);
  // The buyer's own requirement must survive — it is not the farmer's to delete.
  assert.equal(await BuyerRequirement.countDocuments({ buyerId: buyer._id }), 1);
});

/**
 * The deliberate design choice: an order is a shared record, so erasing it
 * would destroy the counterparty's deal history too. It is retained, pointing
 * at an account that now reads as "Deleted user".
 */
test('deletion preserves orders and matches for the counterparty', async () => {
  const { farmer, order, match } = await seedFarmer();

  await deleteMyAccount(farmer._id.toString());

  const survivingOrder = await Order.findById(order._id);
  const survivingMatch = await Match.findById(match._id);

  assert.ok(survivingOrder, "the counterparty's order must survive");
  assert.ok(survivingMatch, "the counterparty's match must survive");
  assert.equal(survivingOrder.status, 'delivered');
});

test('deletion reports how many scans and image files it removed', async () => {
  const { farmer } = await seedFarmer();

  const result = await deleteMyAccount(farmer._id.toString());

  assert.equal(result.scansRemoved, 1);
  // The seeded scan points at a file that is not on disk, so nothing is unlinked.
  assert.equal(result.imagesRemoved, 0);
});

test('deleting the same account twice is a 404, not a crash', async () => {
  const { farmer } = await seedFarmer();

  await deleteMyAccount(farmer._id.toString());

  await assert.rejects(
    () => deleteMyAccount(farmer._id.toString()),
    (err: { code?: string; statusCode?: number }) => {
      assert.equal(err.code, 'USER_NOT_FOUND');
      assert.equal(err.statusCode, 404);
      return true;
    }
  );
});

test("deleting one account leaves the other account untouched", async () => {
  const { farmer, buyer } = await seedFarmer();

  await deleteMyAccount(farmer._id.toString());

  const other = await User.findById(buyer._id);

  assert.ok(other);
  assert.equal(other.fullName, 'Anita Sharma');
  assert.equal(other.email, 'anita@example.com');
  assert.equal(other.isActive, true);
});
