import { describe, it, expect } from 'vitest';
import { parsePagination, paginatedResponse } from '../lib/pagination.js';

const mockRequest = (query: Record<string, string>) => ({ query }) as any;

describe('parsePagination', () => {
  it('returns null when no page param', () => {
    const req = mockRequest({});
    const result = parsePagination(req);
    expect(result).toBeNull();
  });

  it('returns null when page is undefined', () => {
    const req = mockRequest({ limit: '10' });
    const result = parsePagination(req);
    expect(result).toBeNull();
  });

  it('returns correct values for valid params', () => {
    const req = mockRequest({ page: '2', limit: '10' });
    const result = parsePagination(req);
    expect(result).toEqual({
      page: 2,
      limit: 10,
      skip: 10, // (2 - 1) * 10
    });
  });

  it('clamps page to minimum 1', () => {
    const req = mockRequest({ page: '0' });
    const result = parsePagination(req);
    expect(result?.page).toBe(1);
  });

  it('clamps page to minimum 1 for negative values', () => {
    const req = mockRequest({ page: '-5' });
    const result = parsePagination(req);
    expect(result?.page).toBe(1);
  });

  it('clamps limit to max 200', () => {
    const req = mockRequest({ page: '1', limit: '500' });
    const result = parsePagination(req);
    expect(result?.limit).toBe(200);
  });

  it('defaults limit to 50 when not provided', () => {
    const req = mockRequest({ page: '1' });
    const result = parsePagination(req);
    expect(result?.limit).toBe(50);
  });

  it('defaults limit to 50 when invalid', () => {
    const req = mockRequest({ page: '1', limit: 'invalid' });
    const result = parsePagination(req);
    expect(result?.limit).toBe(50);
  });

  it('calculates correct skip value', () => {
    const req = mockRequest({ page: '3', limit: '25' });
    const result = parsePagination(req);
    expect(result?.skip).toBe(50); // (3 - 1) * 25
  });

  it('handles page 1 with zero skip', () => {
    const req = mockRequest({ page: '1', limit: '10' });
    const result = parsePagination(req);
    expect(result?.skip).toBe(0);
  });
});

describe('paginatedResponse', () => {
  it('builds correct structure', () => {
    const data = [{ id: 1 }, { id: 2 }];
    const params = { page: 1, limit: 10, skip: 0 };
    const result = paginatedResponse(data, 25, params);

    expect(result).toEqual({
      data: [{ id: 1 }, { id: 2 }],
      pagination: {
        page: 1,
        limit: 10,
        total: 25,
        totalPages: 3, // Math.ceil(25 / 10)
      },
    });
  });

  it('calculates totalPages correctly for exact division', () => {
    const data: any[] = [];
    const params = { page: 1, limit: 10, skip: 0 };
    const result = paginatedResponse(data, 100, params);

    expect(result.pagination.totalPages).toBe(10);
  });

  it('calculates totalPages correctly for remainder', () => {
    const data: any[] = [];
    const params = { page: 1, limit: 10, skip: 0 };
    const result = paginatedResponse(data, 95, params);

    expect(result.pagination.totalPages).toBe(10); // Math.ceil(95 / 10)
  });

  it('handles edge case with total = 0', () => {
    const data: any[] = [];
    const params = { page: 1, limit: 10, skip: 0 };
    const result = paginatedResponse(data, 0, params);

    expect(result.pagination.totalPages).toBe(0);
    expect(result.data).toEqual([]);
  });

  it('preserves data array reference', () => {
    const data = [{ id: 1 }, { id: 2 }];
    const params = { page: 1, limit: 10, skip: 0 };
    const result = paginatedResponse(data, 2, params);

    expect(result.data).toBe(data);
  });

  it('handles higher page numbers correctly', () => {
    const data = [{ id: 21 }, { id: 22 }];
    const params = { page: 3, limit: 10, skip: 20 };
    const result = paginatedResponse(data, 25, params);

    expect(result.pagination.page).toBe(3);
    expect(result.pagination.total).toBe(25);
    expect(result.pagination.totalPages).toBe(3);
  });
});
