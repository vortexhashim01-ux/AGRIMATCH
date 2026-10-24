import './testEnv';
import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { clearTestDB, startTestDB, stopTestDB } from './db';
import { MandiPrice } from '../src/modules/market-prices/mandiPrice.model';
import { findLiveMandiPrice } from '../src/modules/market-prices/marketPrice.service';

before(startTestDB);
after(stopTestDB);
beforeEach(clearTestDB);

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

async function addQuote(overrides: {
  commodity: string;
  state: string;
  district?: string;
  modalPricePerQuintal: number;
  priceDate?: Date;
  mandiName?: string;
}) {
  return MandiPrice.create({
    commodity: overrides.commodity,
    mandiName: overrides.mandiName ?? 'Test Mandi',
    district: overrides.district ?? 'Nashik',
    state: overrides.state,
    minPricePerQuintal: overrides.modalPricePerQuintal - 100,
    modalPricePerQuintal: overrides.modalPricePerQuintal,
    maxPricePerQuintal: overrides.modalPricePerQuintal + 100,
    priceDate: overrides.priceDate ?? daysAgo(1),
    source: 'agmarknet',
    fetchedAt: new Date(),
  });
}

test('returns null when the cache holds no quote for the crop', async () => {
  assert.equal(
    await findLiveMandiPrice({ commodityNames: ['Potato'], state: 'Maharashtra' }),
    null
  );
});

test('converts the quintal quote to a per-kilogram price', async () => {
  await addQuote({ commodity: 'Potato', state: 'Maharashtra', modalPricePerQuintal: 1250 });

  const found = await findLiveMandiPrice({
    commodityNames: ['Potato'],
    state: 'Maharashtra',
  });

  assert.ok(found);
  assert.equal(found.pricePerKg, 12.5);
  assert.equal(found.pricePerQuintal, 1250);
});

test('commodity matching ignores case', async () => {
  await addQuote({ commodity: 'Tomato', state: 'Maharashtra', modalPricePerQuintal: 900 });

  const found = await findLiveMandiPrice({
    commodityNames: ['tomato'],
    state: 'maharashtra',
  });

  assert.ok(found);
  assert.equal(found.pricePerKg, 9);
});

// Agmarknet publishes compound names such as "Bengal Gram(Gram)(Whole)" while
// the knowledge base says "Bengal Gram", so a substring fallback is required.
test('falls back to a substring match for compound Agmarknet names', async () => {
  await addQuote({
    commodity: 'Bengal Gram(Gram)(Whole)',
    state: 'Madhya Pradesh',
    modalPricePerQuintal: 5200,
  });

  const found = await findLiveMandiPrice({
    commodityNames: ['Bengal Gram'],
    state: 'Madhya Pradesh',
  });

  assert.ok(found, 'expected the parenthesised Agmarknet name to match');
  assert.equal(found.commodity, 'Bengal Gram(Gram)(Whole)');
  assert.equal(found.pricePerKg, 52);
});

test('an anchored match wins over a newer substring match', async () => {
  await addQuote({
    commodity: 'Chilli',
    state: 'Telangana',
    modalPricePerQuintal: 4000,
    priceDate: daysAgo(5),
  });
  // Newer and cheaper, so a substring-first strategy would wrongly pick this.
  await addQuote({
    commodity: 'Green Chilli',
    state: 'Telangana',
    modalPricePerQuintal: 1000,
    priceDate: daysAgo(0),
  });

  const found = await findLiveMandiPrice({
    commodityNames: ['Chilli'],
    state: 'Telangana',
  });

  assert.ok(found);
  assert.equal(found.commodity, 'Chilli');
});

test("the farmer's own district is preferred over the wider state", async () => {
  await addQuote({
    commodity: 'Onion',
    state: 'Maharashtra',
    district: 'Nashik',
    modalPricePerQuintal: 1400,
  });
  await addQuote({
    commodity: 'Onion',
    state: 'Maharashtra',
    district: 'Pune',
    modalPricePerQuintal: 900,
    priceDate: daysAgo(0),
  });

  const found = await findLiveMandiPrice({
    commodityNames: ['Onion'],
    state: 'Maharashtra',
    district: 'Nashik',
  });

  assert.ok(found);
  assert.equal(found.district, 'Nashik');
  assert.equal(found.pricePerKg, 14);
});

test('widens to the state when the district has no quote', async () => {
  await addQuote({
    commodity: 'Onion',
    state: 'Maharashtra',
    district: 'Pune',
    modalPricePerQuintal: 900,
  });

  const found = await findLiveMandiPrice({
    commodityNames: ['Onion'],
    state: 'Maharashtra',
    district: 'Nashik',
  });

  assert.ok(found);
  assert.equal(found.district, 'Pune');
});

test('another state\'s quote is not used', async () => {
  await addQuote({ commodity: 'Wheat', state: 'Punjab', modalPricePerQuintal: 2200 });

  assert.equal(
    await findLiveMandiPrice({ commodityNames: ['Wheat'], state: 'Karnataka' }),
    null
  );
});

test('a stale quote is ignored rather than reported as live', async () => {
  await addQuote({
    commodity: 'Maize',
    state: 'Karnataka',
    modalPricePerQuintal: 2000,
    priceDate: daysAgo(40),
  });

  assert.equal(
    await findLiveMandiPrice({ commodityNames: ['Maize'], state: 'Karnataka' }),
    null
  );
});

test('the most recent quote wins among several in the window', async () => {
  await addQuote({
    commodity: 'Soyabean',
    state: 'Madhya Pradesh',
    modalPricePerQuintal: 4000,
    priceDate: daysAgo(10),
  });
  await addQuote({
    commodity: 'Soyabean',
    state: 'Madhya Pradesh',
    modalPricePerQuintal: 4600,
    priceDate: daysAgo(1),
  });

  const found = await findLiveMandiPrice({
    commodityNames: ['Soyabean'],
    state: 'Madhya Pradesh',
  });

  assert.ok(found);
  assert.equal(found.pricePerQuintal, 4600);
});

// "Rice (Paddy)" yields candidates ['Rice', 'Paddy']; the parenthesised name
// must be usable on its own when that is what Agmarknet publishes.
test('matches the parenthesised spelling when the outer name has no quote', async () => {
  await addQuote({ commodity: 'Paddy', state: 'Punjab', modalPricePerQuintal: 3000 });

  const found = await findLiveMandiPrice({
    commodityNames: ['Rice', 'Paddy'],
    state: 'Punjab',
  });

  assert.ok(found);
  assert.equal(found.commodity, 'Paddy');
});

test('an empty candidate list short-circuits to null', async () => {
  await addQuote({ commodity: 'Rice', state: 'Punjab', modalPricePerQuintal: 3000 });

  assert.equal(
    await findLiveMandiPrice({ commodityNames: ['   '], state: 'Punjab' }),
    null
  );
});

test('a missing state short-circuits to null', async () => {
  await addQuote({ commodity: 'Rice', state: 'Punjab', modalPricePerQuintal: 3000 });

  assert.equal(
    await findLiveMandiPrice({ commodityNames: ['Rice'], state: '  ' }),
    null
  );
});
