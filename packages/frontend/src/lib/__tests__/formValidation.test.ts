import { describe, expect, it } from 'vitest';
import {
  isNonNegativeNumberInput,
  isOptionalPositiveNumberInput,
  isPositiveNumberInput,
} from '../formValidation';

describe('formValidation', () => {
  it('accepts finite positive finance inputs', () => {
    expect(isPositiveNumberInput('1')).toBe(true);
    expect(isPositiveNumberInput('1.25')).toBe(true);
    expect(isPositiveNumberInput('1,234.50')).toBe(true);
  });

  it('rejects empty, zero, negative, and incomplete positive inputs', () => {
    expect(isPositiveNumberInput('')).toBe(false);
    expect(isPositiveNumberInput('0')).toBe(false);
    expect(isPositiveNumberInput('-1')).toBe(false);
    expect(isPositiveNumberInput('.')).toBe(false);
  });

  it('supports non-negative inputs for zero-cost position deltas', () => {
    expect(isNonNegativeNumberInput('0')).toBe(true);
    expect(isNonNegativeNumberInput('0.00')).toBe(true);
    expect(isNonNegativeNumberInput('')).toBe(false);
    expect(isNonNegativeNumberInput('-0.01')).toBe(false);
  });

  it('allows optional positive fields to be blank but not zero', () => {
    expect(isOptionalPositiveNumberInput('')).toBe(true);
    expect(isOptionalPositiveNumberInput('12')).toBe(true);
    expect(isOptionalPositiveNumberInput('0')).toBe(false);
  });
});
