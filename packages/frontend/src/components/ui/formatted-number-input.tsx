import * as React from 'react';
import { Input, type InputProps } from '@/components/ui/input';
import { formatNumberInputValue, sanitizeNumberInput } from './formatted-number-input-utils';

type FormattedNumberInputProps = Omit<InputProps, 'type' | 'value' | 'onChange'> & {
  value: string;
  onValueChange: (value: string) => void;
  allowNegative?: boolean;
};

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
