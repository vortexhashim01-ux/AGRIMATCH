import './testEnv';
import test from 'node:test';
import assert from 'node:assert/strict';
import { detectSevereAlerts } from '../src/services/weather.service';

// The provider's `current` block is unused by the detector, but the type
// demands it, so every fixture carries a placeholder.
const CURRENT = { tempC: 25, humidity: 60, windKph: 5, condition: 'Clear' };

function forecastDay(overrides: {
  tempMinC?: number;
  tempMaxC?: number;
  rainMm?: number;
  condition?: string;
}) {
  return {
    date: new Date('2026-03-01T00:00:00Z'),
    tempMinC: overrides.tempMinC ?? 20,
    tempMaxC: overrides.tempMaxC ?? 30,
    rainMm: overrides.rainMm ?? 0,
    condition: overrides.condition ?? 'Clear',
  };
}

function kinds(forecast: ReturnType<typeof forecastDay>[]): string[] {
  return detectSevereAlerts({ current: CURRENT, forecast }).map((a) => a.kind);
}

test('benign weather produces no alerts', () => {
  assert.deepEqual(kinds([forecastDay({})]), []);
});

// ─────────────────────────────────────────────────────────────────────────────
// Thresholds are deliberately above the advice thresholds (2mm rain, 38C),
// otherwise every ordinary rainy day would push a notification.
// ─────────────────────────────────────────────────────────────────────────────

test('advice-level rain and heat do not trigger a push', () => {
  assert.deepEqual(
    kinds([forecastDay({ rainMm: 10, tempMaxC: 38 })]),
    [],
    '10mm rain / 38C is advisory only, not severe'
  );
});

test('frost fires at or below 4C but not above', () => {
  assert.deepEqual(kinds([forecastDay({ tempMinC: 4 })]), ['frost']);
  assert.deepEqual(kinds([forecastDay({ tempMinC: 4.1 })]), []);
});

test('heatwave fires at or above 40C but not below', () => {
  assert.deepEqual(kinds([forecastDay({ tempMaxC: 40 })]), ['heatwave']);
  assert.deepEqual(kinds([forecastDay({ tempMaxC: 39.9 })]), []);
});

test('heavy rain fires at or above 30mm but not below', () => {
  assert.deepEqual(kinds([forecastDay({ rainMm: 30 })]), ['heavy_rain']);
  assert.deepEqual(kinds([forecastDay({ rainMm: 29.9 })]), []);
});

test('a thunderstorm is reported as a storm, never mislabelled as hail', () => {
  const alerts = detectSevereAlerts({
    current: CURRENT,
    forecast: [forecastDay({ condition: 'Thunderstorm' })],
  });

  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].kind, 'storm');
  assert.match(alerts[0].body, /Thunderstorm|thunderstorm/);
});

test('condition matching for storms is case-insensitive', () => {
  assert.deepEqual(
    kinds([forecastDay({ condition: 'thunderstorm' })]),
    ['storm']
  );
});

test('a single severe day is found when it is not the first day', () => {
  assert.deepEqual(
    kinds([
      forecastDay({}),
      forecastDay({}),
      forecastDay({ rainMm: 55 }),
    ]),
    ['heavy_rain']
  );
});

test('several hazards on the same forecast produce several alerts', () => {
  const found = kinds([
    forecastDay({ tempMinC: 1, tempMaxC: 43, rainMm: 40, condition: 'Thunderstorm' }),
  ]);

  assert.deepEqual(found.sort(), ['frost', 'heatwave', 'heavy_rain', 'storm']);
});

test('each alert carries a title, a body and the offending day', () => {
  const alerts = detectSevereAlerts({
    current: CURRENT,
    forecast: [forecastDay({ tempMaxC: 44 })],
  });

  assert.equal(alerts[0].title, 'Heatwave warning');
  assert.match(alerts[0].body, /2026-03-01/);
  assert.match(alerts[0].body, /44/);
});
