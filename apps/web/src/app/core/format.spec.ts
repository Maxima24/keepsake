import { formatDateTime, formatMinor } from './format';

describe('formatMinor', () => {
  it('formats integer minor units as major with 2 decimals', () => {
    expect(formatMinor(1000)).toBe('10.00');
    expect(formatMinor(1)).toBe('0.01');
    expect(formatMinor(0)).toBe('0.00');
    expect(formatMinor(585000)).toBe('5850.00');
  });

  it('keeps the sign for negatives', () => {
    expect(formatMinor(-1500)).toBe('-15.00');
    expect(formatMinor(-1)).toBe('-0.01');
  });
});

describe('formatDateTime', () => {
  it('formats a valid ISO string to something non-empty', () => {
    expect(formatDateTime('2020-01-01T00:00:00.000Z').length).toBeGreaterThan(0);
  });

  it('returns the input unchanged when it is not a date', () => {
    expect(formatDateTime('not-a-date')).toBe('not-a-date');
  });
});
