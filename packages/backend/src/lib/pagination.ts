import { Request } from 'express';

export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const MAX_DATABASE_OFFSET = 2_147_483_647;

function parsePositiveInteger(value: unknown, fallback: number): number {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : fallback;
}

/**
 * Parse pagination params from request query.
 * Returns null if no pagination params provided (backwards-compatible mode).
 */
export function parsePagination(req: Request): PaginationParams | null {
  const { page, limit } = req.query;

  // If no page param, return null (caller should return full array)
  if (!page) return null;

  const limitNum = Math.min(MAX_LIMIT, parsePositiveInteger(limit, DEFAULT_LIMIT));
  const requestedPage = parsePositiveInteger(page, 1);
  const maxPage = Math.floor(MAX_DATABASE_OFFSET / limitNum) + 1;
  const pageNum = Math.min(requestedPage, maxPage);

  return {
    page: pageNum,
    limit: limitNum,
    skip: (pageNum - 1) * limitNum,
  };
}

/**
 * Build a paginated response object.
 */
export function paginatedResponse<T>(
  data: T[],
  total: number,
  params: PaginationParams
): PaginatedResponse<T> {
  return {
    data,
    pagination: {
      page: params.page,
      limit: params.limit,
      total,
      totalPages: Math.ceil(total / params.limit),
    },
  };
}
