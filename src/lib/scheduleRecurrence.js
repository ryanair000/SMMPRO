export const RECURRENCE_FREQUENCIES = ['none', 'daily', 'weekly'];
export const MAX_RECURRENCE_OCCURRENCES = 60;

const INTERVAL_SECONDS = {
  none: 0,
  daily: 24 * 60 * 60,
  weekly: 7 * 24 * 60 * 60
};

export function normalizeRecurrence(frequency, count) {
  const normalizedFrequency = RECURRENCE_FREQUENCIES.includes(frequency)
    ? frequency
    : 'none';
  const parsedCount = Number.parseInt(count, 10);
  const normalizedCount = normalizedFrequency === 'none'
    ? 1
    : Math.min(
      MAX_RECURRENCE_OCCURRENCES,
      Math.max(1, Number.isFinite(parsedCount) ? parsedCount : 1)
    );

  return {
    frequency: normalizedFrequency,
    count: normalizedCount,
    intervalSeconds: INTERVAL_SECONDS[normalizedFrequency]
  };
}

export function buildOccurrenceTimes(firstUnixTime, frequency, count) {
  const first = Number(firstUnixTime);
  if (!Number.isFinite(first)) {
    throw new Error('First scheduled time must be a Unix timestamp.');
  }

  const recurrence = normalizeRecurrence(frequency, count);
  return Array.from(
    { length: recurrence.count },
    (_, index) => Math.floor(first + index * recurrence.intervalSeconds)
  );
}
