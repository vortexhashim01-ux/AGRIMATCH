import './testEnv';
import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import { clearTestDB, startTestDB, stopTestDB } from './db';
import { User, UserRole } from '../src/modules/users/user.model';
import { CropListing, ICropListing } from '../src/modules/crop-listing/cropListing.model';
import {
  BuyerRequirement,
  IBuyerRequirement,
} from '../src/modules/buyer-requirements/buyerRequirement.model';
import { Match, MatchStatus } from '../src/modules/matching/matching.model';
import { Order, OrderStatus } from '../src/modules/orders/order.model';
import { getDashboardSummary } from '../src/modules/dashboard/dashboard.service';

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

async function makeUser(role: UserRole) {
  return User.create({
    fullName: `Test ${role}`,
    email: `${role}-${new Types.ObjectId().toString()}@example.com`,
    phone: `+9198${Math.floor(Math.random() * 100000000).toString().padStart(8, '0')}`,
    role,
    passwordHash: 'hash',
    isActive: true,
  });
}

async function makeListing(
  farmerId: Types.ObjectId,
  status: ICropListing['status'] = 'active'
) {
  return CropListing.create({
    farmerId,
    cropName: 'Potato',
    quantityKg: 1000,
    expectedPricePerKg: 20,
    status,
    isDeleted: false,
  });
}

async function makeRequirement(
  buyerId: Types.ObjectId,
  status: IBuyerRequirement['status'] = 'open'
) {
  return BuyerRequirement.create({
    buyerId,
    cropName: 'Potato',
    quantityKg: 500,
    maxPricePerKg: 25,
    requiredByDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    status,
    isDeleted: false,
  });
}

async function makeMatch(
  status: MatchStatus,
  farmerId: Types.ObjectId,
  buyerId: Types.ObjectId
) {
  return Match.create({
    cropListingId: newId(),
    buyerRequirementId: newId(),
    farmerId,
    buyerId,
    cropName: 'Potato',
    status,
    hardFilterPass: true,
    scores: SCORES,
    farmerReliabilityScore: 70,
  });
}

async function makeOrder(
  status: OrderStatus,
  farmerId: Types.ObjectId,
  buyerId: Types.ObjectId,
  quantityKg = 100,
  agreedPricePerKg = 20
) {
  return Order.create({
    matchId: newId(),
    farmerId,
    buyerId,
    cropName: 'Potato',
    quantityKg,
    agreedPricePerKg,
    deliveryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    status,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Farmer funnel (PRD §5.5)
// ─────────────────────────────────────────────────────────────────────────────

test('a fresh farmer has an empty funnel', async () => {
  const farmer = await makeUser('farmer');

  const summary = await getDashboardSummary(farmer._id.toString(), 'farmer');

  assert.equal(summary.role, 'farmer');
  assert.deepEqual(summary.funnel, {
    listed: 0,
    connected: 0,
    agreed: 0,
    completed: 0,
  });
});

test('the funnel narrows from listed through agreed to completed', async () => {
  const farmer = await makeUser('farmer');
  const buyerA = await makeUser('buyer');
  const buyerB = await makeUser('buyer');

  await makeListing(farmer._id);
  await makeListing(farmer._id);
  await makeMatch('accepted', farmer._id, buyerA._id);
  await makeMatch('suggested', farmer._id, buyerB._id);
  await makeOrder('delivered', farmer._id, buyerA._id);

  const summary = await getDashboardSummary(farmer._id.toString(), 'farmer');

  assert.deepEqual(summary.funnel, {
    listed: 2,
    connected: 2,
    agreed: 1,
    completed: 1,
  });
});

test('connected counts distinct buyers, not matches', async () => {
  const farmer = await makeUser('farmer');
  const buyer = await makeUser('buyer');

  await makeMatch('suggested', farmer._id, buyer._id);
  await makeMatch('accepted', farmer._id, buyer._id);
  await makeMatch('rejected', farmer._id, buyer._id);

  const summary = await getDashboardSummary(farmer._id.toString(), 'farmer');

  assert.equal(summary.funnel.connected, 1);
});

test('listings are broken down by status and exclude soft-deleted ones', async () => {
  const farmer = await makeUser('farmer');

  await makeListing(farmer._id, 'active');
  await makeListing(farmer._id, 'sold');
  await makeListing(farmer._id, 'expired');
  await CropListing.create({
    farmerId: farmer._id,
    cropName: 'Onion',
    quantityKg: 10,
    expectedPricePerKg: 5,
    status: 'active',
    isDeleted: true,
  });

  const summary = await getDashboardSummary(farmer._id.toString(), 'farmer');

  assert.deepEqual(summary.listings, {
    active: 1,
    matched: 0,
    sold: 1,
    expired: 1,
  });
  assert.equal(summary.funnel.listed, 3);
});

test("another farmer's listings and matches do not leak in", async () => {
  const farmer = await makeUser('farmer');
  const otherFarmer = await makeUser('farmer');
  const buyer = await makeUser('buyer');

  await makeListing(otherFarmer._id);
  await makeMatch('accepted', otherFarmer._id, buyer._id);

  const summary = await getDashboardSummary(farmer._id.toString(), 'farmer');

  assert.deepEqual(summary.funnel, {
    listed: 0,
    connected: 0,
    agreed: 0,
    completed: 0,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Earnings
// ─────────────────────────────────────────────────────────────────────────────

test('earnings count delivered value as settled and in-flight value separately', async () => {
  const farmer = await makeUser('farmer');
  const buyer = await makeUser('buyer');

  // 100kg * 20 = 2000 delivered. 50kg * 10 = 500 shipped (in flight).
  await makeOrder('delivered', farmer._id, buyer._id, 100, 20);
  await makeOrder('shipped', farmer._id, buyer._id, 50, 10);

  const summary = await getDashboardSummary(farmer._id.toString(), 'farmer');

  assert.equal(summary.earnings.settled, 2000);
  assert.equal(summary.earnings.inProgress, 500);
});

test('a cancelled order is counted neither as settled nor in progress', async () => {
  const farmer = await makeUser('farmer');
  const buyer = await makeUser('buyer');

  await makeOrder('delivered', farmer._id, buyer._id, 100, 20);
  await makeOrder('cancelled', farmer._id, buyer._id, 500, 100);

  const summary = await getDashboardSummary(farmer._id.toString(), 'farmer');

  assert.equal(summary.earnings.settled, 2000);
  assert.equal(summary.earnings.inProgress, 0);
});

test('deal counts are reported for every status', async () => {
  const farmer = await makeUser('farmer');
  const buyer = await makeUser('buyer');

  await makeOrder('pending', farmer._id, buyer._id);
  await makeOrder('confirmed', farmer._id, buyer._id);
  await makeOrder('cancelled', farmer._id, buyer._id);

  const summary = await getDashboardSummary(farmer._id.toString(), 'farmer');

  assert.deepEqual(summary.deals, {
    pending: 1,
    confirmed: 1,
    shipped: 0,
    delivered: 0,
    cancelled: 1,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Buyer view
// ─────────────────────────────────────────────────────────────────────────────

test('a buyer sees their own requirements and matched farmers', async () => {
  const buyer = await makeUser('buyer');
  const farmerA = await makeUser('farmer');
  const farmerB = await makeUser('farmer');

  await makeRequirement(buyer._id, 'open');
  await makeRequirement(buyer._id, 'fulfilled');
  await makeMatch('accepted', farmerA._id, buyer._id);
  await makeMatch('suggested', farmerB._id, buyer._id);
  await makeOrder('delivered', farmerA._id, buyer._id, 200, 15);

  const summary = await getDashboardSummary(buyer._id.toString(), 'buyer');

  assert.equal(summary.role, 'buyer');
  assert.equal(summary.funnel.listed, 2);
  assert.equal(summary.funnel.connected, 2);
  assert.equal(summary.funnel.agreed, 1);
  assert.equal(summary.funnel.completed, 1);
  assert.deepEqual(summary.requirements, {
    open: 1,
    matched: 0,
    fulfilled: 1,
    expired: 0,
  });
});

test('a buyer sees spend, not earnings, and never a reliability score', async () => {
  const buyer = await makeUser('buyer');
  const farmer = await makeUser('farmer');

  await makeOrder('delivered', farmer._id, buyer._id, 100, 30);

  const summary = await getDashboardSummary(buyer._id.toString(), 'buyer');

  assert.equal(summary.spend.settled, 3000);
  assert.equal('earnings' in summary, false);
  assert.equal('reliabilityScore' in summary, false);
});

test("the farmer view carries the reliability score and the buyer view does not", async () => {
  const farmer = await makeUser('farmer');
  const buyer = await makeUser('buyer');

  const farmerSummary = await getDashboardSummary(farmer._id.toString(), 'farmer');
  const buyerSummary = await getDashboardSummary(buyer._id.toString(), 'buyer');

  // No history at all, so the neutral prior applies.
  assert.equal(farmerSummary.reliabilityScore, 70);
  assert.equal('reliabilityScore' in buyerSummary, false);
});

// ─────────────────────────────────────────────────────────────────────────────
// Admin view
// ─────────────────────────────────────────────────────────────────────────────

test('an admin gets platform totals rather than a trading funnel', async () => {
  await makeUser('farmer');
  await makeUser('buyer');

  const summary = await getDashboardSummary(newId().toString(), 'admin');

  assert.equal(summary.role, 'admin');
  assert.equal(summary.platform.farmers, 1);
  assert.equal(summary.platform.buyers, 1);
  assert.equal('funnel' in summary, false);
});
