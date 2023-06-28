import type {
  RadioGroupItemProps,
  RadioGroupProps,
} from '@radix-ui/react-radio-group';
import * as RadioGroup from '@radix-ui/react-radio-group';
import { forwardRef } from 'react';

import * as styles from './styles.css';

export const RadioButton = forwardRef<HTMLButtonElement, RadioGroupItemProps>(
  ({ children, ...props }, ref) => {
    return (
      <RadioGroup.Item ref={ref} {...props}>
        <span className={styles.radioUncheckedButton}>{children}</span>
        <RadioGroup.Indicator className={styles.radioButton}>
          {children}
        </RadioGroup.Indicator>
      </RadioGroup.Item>
    );
  }
);
RadioButton.displayName = 'RadioButton';

export const RadioButtonGroup = forwardRef<HTMLDivElement, RadioGroupProps>(
  ({ ...props }, ref) => {
    return (
      <RadioGroup.Root
        ref={ref}
        className={styles.radioButtonGroup}
        {...props}
      ></RadioGroup.Root>
    );
  }
);
RadioButtonGroup.displayName = 'RadioButtonGroup';
