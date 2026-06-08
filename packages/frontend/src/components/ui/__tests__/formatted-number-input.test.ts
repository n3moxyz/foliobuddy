import { describe, expect, it } from 'vitest';
import { formatNumberInputValue, sanitizeNumberInput } from '../formatted-number-input-utils';

describe('formatted number input helpers', () => {
  it('adds thousands separators while preserving decimals', () => {
    expect(formatNumberInputValue('10000')).toBe('10,000');
    expect(formatNumberInputValue('1000000')).toBe('1,000,000');
    expect(formatNumberInputValue('1234567.89')).toBe('1,234,567.89');
    expect(formatNumberInputValue('1234.')).toBe('1,234.');
  });

  it('returns raw numeric strings without commas', () => {
    expect(sanitizeNumberInput('10,000')).toBe('10000');
    expect(sanitizeNumberInput('$1,234,567.89')).toBe('1234567.89');
    expect(sanitizeNumberInput('1.2.3')).toBe('1.23');
  });

  it('only preserves a leading negative sign when allowed', () => {
    expect(sanitizeNumberInput('-1000')).toBe('1000');
    expect(sanitizeNumberInput('-1000', true)).toBe('-1000');
    expect(formatNumberInputValue('-1000.50')).toBe('-1,000.50');
  });
});
