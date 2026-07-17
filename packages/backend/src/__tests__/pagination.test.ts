import type { Request } from 'express';
import { describe, expect, it } from 'vitest';
import { paginatedResponse, parsePagination } from '../lib/pagination.js';

const requestWith = (query: Record<string, unknown>) => ({ query }) as Request;

describe('parsePagination', () => {
  it('keeps backwards-compatible unpaginated mode unless page is present', () => {
    expect(parsePagination(requestWith({}))).toBeNull();
    expect(parsePagination(requestWith({ limit: '10' }))).toBeNull();
  });

  it('parses valid pages and limits into a safe database offset', () => {
    expect(parsePagination(requestWith({ page: '3', limit: '25' }))).toEqual({
      page: 3,
      limit: 25,
      skip: 50,
    });
  });

  it.each([
    ['zero', '0'],
    ['negative', '-5'],
    ['fractional', '2.5'],
    ['trailing junk', '2junk'],
    ['non-finite', 'Infinity'],
    ['unsafe integer', '999999999999999999999999'],
  ])('normalizes a %s page to the first page', (_label, page) => {
    expect(parsePagination(requestWith({ page }))?.page).toBe(1);
  });

  it.each([
    ['missing', undefined, 50],
    ['zero', '0', 50],
    ['fractional', '1.5', 50],
    ['trailing junk', '10items', 50],
    ['oversized', '500', 200],
  ])('uses a safe limit for %s input', (_label, limit, expected) => {
    const query = limit === undefined ? { page: '1' } : { page: '1', limit };
    expect(parsePagination(requestWith(query))?.limit).toBe(expected);
  });

  it('never emits an unsafe skip value for a resource-exhaustion page', () => {
    const result = parsePagination(
      requestWith({ page: String(Number.MAX_SAFE_INTEGER), limit: '200' })
    );

    expect(result?.skip).toBeLessThanOrEqual(2_147_483_647);
    expect(Number.isSafeInteger(result?.skip)).toBe(true);
  });
});

describe('paginatedResponse', () => {
  it.each([
    [25, 10, 3],
    [100, 10, 10],
    [0, 10, 0],
  ])('reports %i records at limit %i as %i pages', (total, limit, totalPages) => {
    const data = [{ id: 1 }];
    const result = paginatedResponse(data, total, { page: 1, limit, skip: 0 });

    expect(result).toEqual({
      data,
      pagination: { page: 1, limit, total, totalPages },
    });
    expect(result.data).toBe(data);
  });
});
