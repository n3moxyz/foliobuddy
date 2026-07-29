export function isPositiveNumberInput(value: string): boolean {
  const normalized = value.replace(/,/g, '').trim();
  if (!normalized) return false;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0;
}

export function isNonNegativeNumberInput(value: string): boolean {
  const normalized = value.replace(/,/g, '').trim();
  if (!normalized) return false;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0;
}

export function isOptionalPositiveNumberInput(value: string): boolean {
  return value.trim() === '' || isPositiveNumberInput(value);
}

export function isOptionalNonNegativeNumberInput(value: string): boolean {
  return value.trim() === '' || isNonNegativeNumberInput(value);
}
