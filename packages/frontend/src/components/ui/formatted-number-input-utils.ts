export function sanitizeNumberInput(value: string, allowNegative = false) {
  let sanitized = '';
  let hasDecimal = false;
  let hasSign = false;

  for (const char of value.replace(/,/g, '')) {
    if (char >= '0' && char <= '9') {
      sanitized += char;
      continue;
    }

    if (char === '.' && !hasDecimal) {
      sanitized += char;
      hasDecimal = true;
      continue;
    }

    if (allowNegative && char === '-' && !hasSign && sanitized.length === 0) {
      sanitized += char;
      hasSign = true;
    }
  }

  return sanitized;
}

export function formatNumberInputValue(value: string) {
  if (!value) return '';
  if (value === '-' || value === '.' || value === '-.') return value;

  const sign = value.startsWith('-') ? '-' : '';
  const unsigned = sign ? value.slice(1) : value;
  const [integerPart = '', decimalPart] = unsigned.split('.');
  const groupedInteger =
    integerPart.length > 0 ? integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '';

  if (decimalPart !== undefined) {
    return `${sign}${groupedInteger}.${decimalPart}`;
  }

  return `${sign}${groupedInteger}`;
}
