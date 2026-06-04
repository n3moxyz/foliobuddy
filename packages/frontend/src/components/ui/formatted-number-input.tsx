import * as React from 'react';
import { Input, type InputProps } from '@/components/ui/input';

type FormattedNumberInputProps = Omit<InputProps, 'type' | 'value' | 'onChange'> & {
  value: string;
  onValueChange: (value: string) => void;
  allowNegative?: boolean;
};

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

const FormattedNumberInput = React.forwardRef<HTMLInputElement, FormattedNumberInputProps>(
  ({ value, onValueChange, allowNegative = false, inputMode = 'decimal', ...props }, ref) => {
    return (
      <Input
        {...props}
        ref={ref}
        type="text"
        inputMode={inputMode}
        value={formatNumberInputValue(value)}
        onChange={(event) => {
          onValueChange(sanitizeNumberInput(event.target.value, allowNegative));
        }}
      />
    );
  }
);

FormattedNumberInput.displayName = 'FormattedNumberInput';

export { FormattedNumberInput };
