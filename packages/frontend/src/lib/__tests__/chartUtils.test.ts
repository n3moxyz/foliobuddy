import { describe, expect, it } from 'vitest';
import { getDateRange } from '@/lib/chartUtils';

describe('getDateRange', () => {
  it('marks Max as an explicit all-time request', () => {
    expect(getDateRange('Max')).toEqual({ all: true });
  });
});
