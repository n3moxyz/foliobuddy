import { describe, expect, it } from 'vitest';
import { isValidDateInput, parseBoundedIntegerQuery, parseDateQuery } from '../lib/queryParams.js';

const options = { name: 'days', defaultValue: 30, max: 365 };

describe('parseBoundedIntegerQuery', () => {
  it('defaults only when the parameter is absent', () => {
    expect(parseBoundedIntegerQuery(undefined, options)).toBe(30);
  });

  it.each(['', ' ', '-1', '1.5', '30days', 'Infinity', '99999999999999999999999'])(
    'rejects malformed or unsafe input %j',
    (value) => {
      expect(() => parseBoundedIntegerQuery(value, options)).toThrow(
        'days must be a positive integer'
      );
    }
  );

  it('caps resource-heavy values when the endpoint allows clamping', () => {
    expect(parseBoundedIntegerQuery('1000000', options)).toBe(365);
  });

  it('can reject rather than clamp bounded calendar fields', () => {
    expect(() =>
      parseBoundedIntegerQuery('10000', {
        name: 'year',
        defaultValue: 2026,
        min: 1970,
        max: 9999,
        clampMax: false,
      })
    ).toThrow('year must be at most 9999');
  });
});

describe('date input validation', () => {
  it.each(['2026-02-28', '2024-02-29', '2026-07-17T10:00:00.000Z'])(
    'accepts real calendar date %s',
    (value) => expect(isValidDateInput(value)).toBe(true)
  );

  it.each(['', 'not-a-date', '2026-02-29', '2026-02-31', '2026-13-01', '07/17/2026'])(
    'rejects impossible or ambiguous calendar date %s',
    (value) => expect(isValidDateInput(value)).toBe(false)
  );

  it('rejects repeated query parameters instead of coercing the array', () => {
    expect(() => parseDateQuery(['2026-01-01'], 'from')).toThrow('from must be a valid date');
  });
});
