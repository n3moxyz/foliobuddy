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

/**
 * Parse pagination params from request query.
 * Returns null if no pagination params provided (backwards-compatible mode).
 */
export function parsePagination(req: Request): PaginationParams | null {
  const { page, limit } = req.query;

  // If no page param, return null (caller should return full array)
  if (!page) return null;

  const pageNum = Math.max(1, parseInt(page as string) || 1);
  const limitNum = Math.min(MAX_LIMIT, Math.max(1, parseInt(limit as string) || DEFAULT_LIMIT));

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
