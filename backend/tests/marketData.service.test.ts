import './testEnv';
import test from 'node:test';
import assert from 'node:assert/strict';
import { env } from '../src/config/env';
import { fetchAgmarknetPrices } from '../src/services/marketData.service';

const REAL_KEY = 'test-agmarknet-key';
const PLACEHOLDER_KEY = 'your_data_gov_in_api_key';

function withKey<T>(key: string | undefined, run: () => Promise<T>): Promise<T> {
  const previous = env.AGMARKNET_API_KEY;
  env.AGMARKNET_API_KEY = key;
  return run().finally(() => {
    env.AGMARKNET_API_KEY = previous;
  });
}

function stubFetch(
  t: { mock: { method: (o: object, m: string, i: unknown) => unknown } },
  impl: (...args: unknown[]) => Promise<Response>
): void {
  t.mock.method(globalThis, 'fetch', impl);
}

test('a missing key yields 503 PROVIDER_NOT_CONFIGURED', async () => {
  await assert.rejects(
    () => withKey(undefined, () => fetchAgmarknetPrices({ commodity: 'Potato' })),
    (err: { statusCode?: number; code?: string }) =>
      err.statusCode === 503 && err.code === 'PROVIDER_NOT_CONFIGURED'
  );
});

test('the placeholder key is treated as unconfigured', async () => {
  await assert.rejects(
    () => withKey(PLACEHOLDER_KEY, () => fetchAgmarknetPrices({ commodity: 'Potato' })),
    (err: { statusCode?: number; code?: string }) =>
      err.statusCode === 503 && err.code === 'PROVIDER_NOT_CONFIGURED'
  );
});

test('records are normalised into quotes', async (t) => {
  stubFetch(t, async () =>
    new Response(
      JSON.stringify({
        records: [
          {
            commodity: 'Potato',
            market: 'APMC Kamthi',
            district: 'Nagpur',
            state: 'Maharashtra',
            min_price: '2000',
            modal_price: '2350',
            max_price: '2500',
            arrival_date: '23/10/2026',
          },
        ],
      }),
      { status: 200 }
    )
  );

  const quotes = await withKey(REAL_KEY, () => fetchAgmarknetPrices({ commodity: 'Potato' }));

  assert.equal(quotes.length, 1);
  assert.deepEqual(quotes[0], {
    commodity: 'Potato',
    mandiName: 'APMC Kamthi',
    district: 'Nagpur',
    state: 'Maharashtra',
    minPricePerQuintal: 2000,
    modalPricePerQuintal: 2350,
    maxPricePerQuintal: 2500,
    priceDate: new Date(Date.UTC(2026, 9, 23)),
  });
});

test('the request carries the key, commodity and location filters', async (t) => {
  let requestedUrl = '';
  stubFetch(t, async (url: unknown) => {
    requestedUrl = String(url);
    return new Response(JSON.stringify({ records: [] }), { status: 200 });
  });

  await withKey(REAL_KEY, () =>
    fetchAgmarknetPrices({ commodity: 'Potato', state: 'Maharashtra', district: 'Nagpur' })
  );

  const parsed = new URL(requestedUrl);
  assert.equal(parsed.searchParams.get('api-key'), REAL_KEY);
  assert.equal(parsed.searchParams.get('filters[commodity]'), 'Potato');
  assert.equal(parsed.searchParams.get('filters[state]'), 'Maharashtra');
  assert.equal(parsed.searchParams.get('filters[district]'), 'Nagpur');
});

test('rows that cannot be represented faithfully are dropped', async (t) => {
  stubFetch(t, async () =>
    new Response(
      JSON.stringify({
        records: [
          // no mandi name
          { commodity: 'Potato', market: '', min_price: '10', modal_price: '20', max_price: '30', arrival_date: '23/10/2026' },
          // zero modal price
          { commodity: 'Potato', market: 'APMC A', min_price: '10', modal_price: '0', max_price: '30', arrival_date: '23/10/2026' },
          // unparseable price
          { commodity: 'Potato', market: 'APMC B', min_price: 'abc', modal_price: '20', max_price: '30', arrival_date: '23/10/2026' },
          // missing date
          { commodity: 'Potato', market: 'APMC C', min_price: '10', modal_price: '20', max_price: '30', arrival_date: '' },
          // the only row that survives
          { commodity: 'Potato', market: 'APMC D', min_price: '1,100', modal_price: '1,200', max_price: '1,300', arrival_date: '23/10/2026' },
        ],
      }),
      { status: 200 }
    )
  );

  const quotes = await withKey(REAL_KEY, () => fetchAgmarknetPrices({ commodity: 'Potato' }));

  assert.equal(quotes.length, 1);
  assert.equal(quotes[0].mandiName, 'APMC D');
  // Thousands separators are stripped rather than turning the price into NaN.
  assert.equal(quotes[0].minPricePerQuintal, 1100);
  assert.equal(quotes[0].modalPricePerQuintal, 1200);
  assert.equal(quotes[0].maxPricePerQuintal, 1300);
});

test('a missing records array yields an empty list rather than throwing', async (t) => {
  stubFetch(t, async () => new Response(JSON.stringify({}), { status: 200 }));

  const quotes = await withKey(REAL_KEY, () => fetchAgmarknetPrices({ commodity: 'Potato' }));

  assert.deepEqual(quotes, []);
});
