import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOccurrenceTimes,
  normalizeRecurrence
} from '../src/lib/scheduleRecurrence.js';

test('builds daily occurrence times from the first publish time', () => {
  assert.deepEqual(
    buildOccurrenceTimes(2_000_000_000, 'daily', 3),
    [2_000_000_000, 2_000_086_400, 2_000_172_800]
  );
});

test('builds weekly occurrence times from the first publish time', () => {
  assert.deepEqual(
    buildOccurrenceTimes(2_000_000_000, 'weekly', 3),
    [2_000_000_000, 2_000_604_800, 2_001_209_600]
  );
});

test('does not repeat when recurrence is disabled', () => {
  assert.deepEqual(buildOccurrenceTimes(2_000_000_000, 'none', 60), [2_000_000_000]);
});

test('normalizes recurrence counts to the supported range', () => {
  assert.deepEqual(normalizeRecurrence('daily', 0), {
    frequency: 'daily',
    count: 1,
    intervalSeconds: 86_400
  });
  assert.equal(normalizeRecurrence('weekly', 100).count, 60);
});
