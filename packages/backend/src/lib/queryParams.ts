import { AppError } from '../middleware/errorHandler.js';

interface BoundedIntegerOptions {
  name: string;
  defaultValue: number;
  min?: number;
  max: number;
  clampMax?: boolean;
}

export function parseBoundedIntegerQuery(
  value: unknown,
  { name, defaultValue, min = 1, max, clampMax = true }: BoundedIntegerOptions
): number {
  if (value === undefined) return defaultValue;
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) {
    throw new AppError(`${name} must be a positive integer`, 400);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min) {
    throw new AppError(`${name} must be a positive integer`, 400);
  }
  if (parsed > max) {
    if (clampMax) return max;
    throw new AppError(`${name} must be at most ${max}`, 400);
  }
  return parsed;
}

export function isValidDateInput(value: string): boolean {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return false;

  const calendarDate = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/);
  if (!calendarDate) return false;
  const [, yearText, monthText, dayText] = calendarDate;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const normalized = new Date(Date.UTC(year, month - 1, day));

  return (
    normalized.getUTCFullYear() === year &&
    normalized.getUTCMonth() === month - 1 &&
    normalized.getUTCDate() === day
  );
}

export function parseDateQuery(value: unknown, name: string): Date | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !isValidDateInput(value)) {
    throw new AppError(`${name} must be a valid date`, 400);
  }
  return new Date(value);
}
