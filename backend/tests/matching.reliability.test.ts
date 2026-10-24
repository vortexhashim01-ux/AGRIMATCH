import './testEnv';
import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import { clearTestDB, startTestDB, stopTestDB } from './db';
import { Match, MatchStatus } from '../src/modules/matching/matching.model';
import {
  getFarmerReliabilityScore,
  getFarmerReliabilityScores,
} from '../src/modules/matching/matching.service';

before(startTestDB);
after(stopTestDB);
beforeEach(clearTestDB);

const NEUTRAL = 70;

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

async function seedMatch(opts: {
  farmerId: Types.ObjectId;
  status: MatchStatus;
  rejectedById?: Types.ObjectId;
}) {
  return Match.create({
    cropListingId: new Types.ObjectId(),
    buyerRequirementId: new Types.ObjectId(),
    farmerId: opts.farmerId,
    buyerId: new Types.ObjectId(),
    cropName: 'Potato',
    status: opts.status,
    hardFilterPass: true,
    scores: SCORES,
    farmerReliabilityScore: 100,
    rejectedById: opts.rejectedById,
  });
}

test('a farmer with no history scores the neutral prior', async () => {
  assert.equal(await getFarmerReliabilityScore(new Types.ObjectId()), NEUTRAL);
});

test('indecisive matches do not move the score', async () => {
  const farmer = new Types.ObjectId();
  for (const status of ['suggested', 'pending', 'expired'] as const) {
    await seedMatch({ farmerId: farmer, status });
  }

  assert.equal(await getFarmerReliabilityScore(farmer), NEUTRAL);
});

test('an acceptance lifts the score above the prior without pinning it at 100', async () => {
  const farmer = new Types.ObjectId();
  await seedMatch({ farmerId: farmer, status: 'accepted' });

  const score = await getFarmerReliabilityScore(farmer);

  // (1 + 3*0.7) / (1 + 0 + 3) = 0.775. Binary floating point makes that
  // 0.7749999..., so it lands on 77 rather than the arithmetically expected 78.
  assert.equal(score, 77);
  assert.ok(score > NEUTRAL, 'an acceptance should raise the score');
  assert.ok(score < 100, 'the prior must stop a single accept reaching 100');
});

test('a rejection the farmer made lowers the score', async () => {
  const farmer = new Types.ObjectId();
  await seedMatch({ farmerId: farmer, status: 'rejected', rejectedById: farmer });

  // (0 + 3*0.7) / (0 + 1 + 3) = 0.525, again landing one below on rounding.
  assert.equal(await getFarmerReliabilityScore(farmer), 52);
});

test('repeated farmer rejections keep lowering the score', async () => {
  const farmer = new Types.ObjectId();
  await seedMatch({ farmerId: farmer, status: 'rejected', rejectedById: farmer });
  await seedMatch({ farmerId: farmer, status: 'rejected', rejectedById: farmer });

  assert.equal(await getFarmerReliabilityScore(farmer), 42);
});

test('a buyer walking away must not count against the farmer', async () => {
  const farmer = new Types.ObjectId();
  const buyer = new Types.ObjectId();

  // Status is rejected, but the buyer is the one who rejected it.
  await seedMatch({ farmerId: farmer, status: 'rejected', rejectedById: buyer });

  assert.equal(
    await getFarmerReliabilityScore(farmer),
    NEUTRAL,
    'the farmer was not the rejecter, so their score must not drop'
  );
});

test('a buyer rejection does not cancel out a farmer acceptance', async () => {
  const farmer = new Types.ObjectId();
  const buyer = new Types.ObjectId();

  await seedMatch({ farmerId: farmer, status: 'accepted' });
  await seedMatch({ farmerId: farmer, status: 'rejected', rejectedById: buyer });

  // Same as one acceptance with no rejections: the buyer's rejection is
  // ignored, so this is the 77 from the acceptance case above.
  assert.equal(await getFarmerReliabilityScore(farmer), 77);
});

test('scores are computed per farmer', async () => {
  const strong = new Types.ObjectId();
  const weak = new Types.ObjectId();
  const unknown = new Types.ObjectId();

  await seedMatch({ farmerId: strong, status: 'accepted' });
  await seedMatch({ farmerId: weak, status: 'rejected', rejectedById: weak });

  const scores = await getFarmerReliabilityScores([strong, weak, unknown]);

  // `strong` mirrors the single-acceptance case (77) and `weak` the single
  // farmer-rejection case (52) above.
  assert.equal(scores.get(strong.toString()), 77);
  assert.equal(scores.get(weak.toString()), 52);
  assert.equal(scores.get(unknown.toString()), NEUTRAL);
});

test('an empty farmer list yields an empty map', async () => {
  assert.equal((await getFarmerReliabilityScores([])).size, 0);
});
