import './testEnv';
import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import { clearTestDB, startTestDB, stopTestDB } from './db';
import { Order } from '../src/modules/orders/order.model';
import { Match, MatchStatus } from '../src/modules/matching/matching.model';
import { CropListing } from '../src/modules/crop-listing/cropListing.model';
import {
  changeOrderStatus,
  createOrder,
  getOrderById,
  listOrders,
} from '../src/modules/orders/order.service';
import { acceptMatch, rejectMatch } from '../src/modules/matching/matching.service';

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

async function makeListing(farmerId: Types.ObjectId) {
  return CropListing.create({
    farmerId,
    cropName: 'Potato',
    quantityKg: 1000,
    expectedPricePerKg: 20,
    status: 'active',
    isDeleted: false,
  });
}

async function makeMatch(
  status: MatchStatus,
  opts: { farmerId: Types.ObjectId; buyerId: Types.ObjectId; cropListingId?: Types.ObjectId }
) {
  return Match.create({
    cropListingId: opts.cropListingId ?? newId(),
    buyerRequirementId: newId(),
    farmerId: opts.farmerId,
    buyerId: opts.buyerId,
    cropName: 'Potato',
    status,
    hardFilterPass: true,
    scores: SCORES,
    farmerReliabilityScore: 70,
  });
}

function orderInput(matchId: Types.ObjectId) {
  return {
    matchId: matchId.toString(),
    quantityKg: 500,
    agreedPricePerKg: 22,
    deliveryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  };
}

async function expectError(fn: () => Promise<unknown>, code: string, statusCode: number) {
  await assert.rejects(fn, (err: { code?: string; statusCode?: number }) => {
    assert.equal(err.code, code, `expected code ${code} but got ${err.code}`);
    assert.equal(err.statusCode, statusCode);
    return true;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Orders cannot exist without an accepted match
// ─────────────────────────────────────────────────────────────────────────────

test('an order cannot be created while the match is only suggested', async () => {
  const farmer = newId();
  const buyer = newId();
  const match = await makeMatch('suggested', { farmerId: farmer, buyerId: buyer });

  await expectError(
    () => createOrder(farmer, orderInput(match._id!)),
    'ORDER_MATCH_NOT_ACCEPTED',
    409
  );
});

test('an order cannot be created while the match is pending', async () => {
  const farmer = newId();
  const buyer = newId();
  const match = await makeMatch('pending', { farmerId: farmer, buyerId: buyer });

  await expectError(
    () => createOrder(farmer, orderInput(match._id!)),
    'ORDER_MATCH_NOT_ACCEPTED',
    409
  );
});

test('a non-participant cannot create an order for someone else’s match', async () => {
  const match = await makeMatch('accepted', { farmerId: newId(), buyerId: newId() });

  await expectError(
    () => createOrder(newId(), orderInput(match._id!)),
    'MATCH_NOT_FOUND',
    404
  );
});

test('a match can only be converted into a single order', async () => {
  const farmer = newId();
  const buyer = newId();
  const match = await makeMatch('accepted', { farmerId: farmer, buyerId: buyer });

  await createOrder(farmer, orderInput(match._id!));

  await expectError(
    () => createOrder(buyer, orderInput(match._id!)),
    'ORDER_ALREADY_EXISTS',
    409
  );
  assert.equal(await Order.countDocuments({}), 1);
});

test('a created order inherits the match parties and starts pending', async () => {
  const farmer = newId();
  const buyer = newId();
  const match = await makeMatch('accepted', { farmerId: farmer, buyerId: buyer });

  const order = await createOrder(buyer, orderInput(match._id!));

  assert.equal(order.status, 'pending');
  assert.equal(order.farmerId.toString(), farmer.toString());
  assert.equal(order.buyerId.toString(), buyer.toString());
  assert.equal(order.cropName, 'Potato');
  assert.equal(order.quantityKg, 500);
  assert.equal(order.agreedPricePerKg, 22);
});

// ─────────────────────────────────────────────────────────────────────────────
// Order state machine
// ─────────────────────────────────────────────────────────────────────────────

/** Creates an accepted match plus its pending order, returning both. */
async function acceptedMatchWithOrder() {
  const farmer = newId();
  const buyer = newId();
  const match = await makeMatch('accepted', { farmerId: farmer, buyerId: buyer });
  const order = await createOrder(farmer, orderInput(match._id!));
  return { farmer, buyer, match, order };
}

test('an order walks pending → confirmed → shipped → delivered', async () => {
  const { farmer, order } = await acceptedMatchWithOrder();

  for (const status of ['confirmed', 'shipped', 'delivered'] as const) {
    const updated = await changeOrderStatus(farmer, order._id!, status);
    assert.equal(updated!.status, status);
  }
});

test('states cannot be skipped', async () => {
  const { farmer, order } = await acceptedMatchWithOrder();

  await expectError(
    () => changeOrderStatus(farmer, order._id!, 'shipped'),
    'ORDER_INVALID_STATE',
    409
  );
  await expectError(
    () => changeOrderStatus(farmer, order._id!, 'delivered'),
    'ORDER_INVALID_STATE',
    409
  );
});

test('delivered and cancelled are terminal states', async () => {
  const { farmer, order } = await acceptedMatchWithOrder();

  await changeOrderStatus(farmer, order._id!, 'confirmed');
  await changeOrderStatus(farmer, order._id!, 'shipped');
  await changeOrderStatus(farmer, order._id!, 'delivered');

  for (const status of ['confirmed', 'shipped', 'delivered', 'cancelled'] as const) {
    await expectError(
      () => changeOrderStatus(farmer, order._id!, status),
      'ORDER_INVALID_STATE',
      409
    );
  }
});

test('a shipped order can no longer be cancelled', async () => {
  const { farmer, order } = await acceptedMatchWithOrder();

  await changeOrderStatus(farmer, order._id!, 'confirmed');
  await changeOrderStatus(farmer, order._id!, 'shipped');

  await expectError(
    () => changeOrderStatus(farmer, order._id!, 'cancelled'),
    'ORDER_INVALID_STATE',
    409
  );
});

test('cancelling a pending order records who cancelled it', async () => {
  const { buyer, order } = await acceptedMatchWithOrder();

  const cancelled = await changeOrderStatus(buyer, order._id!, 'cancelled');

  assert.equal(cancelled!.status, 'cancelled');
  assert.equal(cancelled!.cancelledById?.toString(), buyer.toString());
});

test('a non-participant cannot move an order', async () => {
  const { order } = await acceptedMatchWithOrder();

  await expectError(
    () => changeOrderStatus(newId(), order._id!, 'confirmed'),
    'ORDER_NOT_FOUND',
    404
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Delivery releases the crop listing
// ─────────────────────────────────────────────────────────────────────────────

test('delivering an order flips the matched listing from active to sold', async () => {
  const farmer = newId();
  const listing = await makeListing(farmer);
  const match = await makeMatch('accepted', {
    farmerId: farmer,
    buyerId: newId(),
    cropListingId: listing._id as Types.ObjectId,
  });
  const order = await createOrder(farmer, orderInput(match._id!));

  await changeOrderStatus(farmer, order._id!, 'confirmed');
  await changeOrderStatus(farmer, order._id!, 'shipped');
  await changeOrderStatus(farmer, order._id!, 'delivered');

  const reloaded = await CropListing.findById(listing._id);
  assert.equal(reloaded!.status, 'sold');
});

test('delivering does not resurrect a listing that is already sold', async () => {
  const farmer = newId();
  const listing = await makeListing(farmer);
  listing.status = 'sold';
  await listing.save();

  const match = await makeMatch('accepted', {
    farmerId: farmer,
    buyerId: newId(),
    cropListingId: listing._id as Types.ObjectId,
  });
  const order = await createOrder(farmer, orderInput(match._id!));

  await changeOrderStatus(farmer, order._id!, 'confirmed');
  await changeOrderStatus(farmer, order._id!, 'shipped');
  await changeOrderStatus(farmer, order._id!, 'delivered');

  const reloaded = await CropListing.findById(listing._id);
  assert.equal(reloaded!.status, 'sold');
});

// ─────────────────────────────────────────────────────────────────────────────
// Visibility
// ─────────────────────────────────────────────────────────────────────────────

test('an order is invisible to everyone but its participants', async () => {
  const { farmer, buyer, order } = await acceptedMatchWithOrder();

  assert.ok(await getOrderById(farmer, order._id!));
  assert.ok(await getOrderById(buyer, order._id!));
  assert.equal(await getOrderById(newId(), order._id!), null);
});

test('an outsider sees no orders at all', async () => {
  const { farmer } = await acceptedMatchWithOrder();

  const ownOrders = await listOrders(farmer, undefined, {});
  const outsiderOrders = await listOrders(newId(), undefined, {});

  assert.equal(ownOrders.length, 1);
  assert.equal(outsiderOrders.length, 0);
});

// ─────────────────────────────────────────────────────────────────────────────
// Two-sided match acceptance
// ─────────────────────────────────────────────────────────────────────────────

test('one side accepting moves a match from suggested to pending', async () => {
  const farmer = newId();
  const match = await makeMatch('suggested', { farmerId: farmer, buyerId: newId() });

  const updated = await acceptMatch(match._id!, farmer, 'farmer');

  assert.equal(updated.status, 'pending');
  assert.ok(updated.farmerViewedAt);
});

test('the same side accepting twice does not complete the match', async () => {
  const farmer = newId();
  const match = await makeMatch('suggested', { farmerId: farmer, buyerId: newId() });

  await acceptMatch(match._id!, farmer, 'farmer');
  const again = await acceptMatch(match._id!, farmer, 'farmer');

  // The buyer has still not viewed it, so the deal must stay unconfirmed.
  assert.equal(again.status, 'pending');
  assert.equal(again.buyerViewedAt, undefined);
});

test('a match becomes accepted only once both sides accept', async () => {
  const farmer = newId();
  const buyer = newId();
  const match = await makeMatch('suggested', { farmerId: farmer, buyerId: buyer });

  await acceptMatch(match._id!, farmer, 'farmer');
  const accepted = await acceptMatch(match._id!, buyer, 'buyer');

  assert.equal(accepted.status, 'accepted');
  assert.ok(accepted.farmerViewedAt);
  assert.ok(accepted.buyerViewedAt);
});

test('a rejected match cannot be accepted afterwards', async () => {
  const farmer = newId();
  const buyer = newId();
  const match = await makeMatch('suggested', { farmerId: farmer, buyerId: buyer });

  await rejectMatch(match._id!, buyer, 'not needed');

  await expectError(
    () => acceptMatch(match._id!, buyer, 'buyer'),
    'MATCH_INVALID_STATE',
    409
  );
});

test('rejecting a match records who rejected it and why', async () => {
  const farmer = newId();
  const buyer = newId();
  const match = await makeMatch('suggested', { farmerId: farmer, buyerId: buyer });

  const rejected = await rejectMatch(match._id!, buyer, 'price too high');

  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.rejectedById?.toString(), buyer.toString());
  assert.equal(rejected.rejectedReason, 'price too high');
});

test('a match accepted by both sides can then produce an order', async () => {
  const farmer = newId();
  const buyer = newId();
  const match = await makeMatch('suggested', { farmerId: farmer, buyerId: buyer });

  await acceptMatch(match._id!, farmer, 'farmer');
  await acceptMatch(match._id!, buyer, 'buyer');

  const order = await createOrder(farmer, orderInput(match._id!));

  assert.equal(order.status, 'pending');
  assert.equal(order.matchId.toString(), match._id!.toString());
});
