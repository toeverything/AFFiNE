import type {
  RadioGroupItemProps,
  RadioGroupProps,
} from '@radix-ui/react-radio-group';
import * as RadixRadioGroup from '@radix-ui/react-radio-group';
import clsx from 'clsx';
import type { CSSProperties } from 'react';
import { forwardRef } from 'react';

import { RadioGroup } from '../radio';
import * as styles from './styles.css';

// for reference
RadioGroup;

/**
 * @deprecated
 * use {@link RadioGroup } instead
 */
export const RadioButton = forwardRef<
  HTMLButtonElement,
  RadioGroupItemProps & { spanStyle?: string }
>(({ children, className, spanStyle, ...props }, ref) => {
  return (
    <RadixRadioGroup.Item
      ref={ref}
      {...props}
      className={clsx(styles.radioButton, className)}
    >
      <span className={clsx(styles.radioUncheckedButton, spanStyle)}>
        {children}
      </span>
      <RadixRadioGroup.Indicator
        className={clsx(styles.radioButtonContent, spanStyle)}
      >
        {children}
      </RadixRadioGroup.Indicator>
    </RadixRadioGroup.Item>
  );
});
RadioButton.displayName = 'RadioButton';

/**
 * @deprecated
 * use {@link RadioGroup} instead
 */
export const RadioButtonGroup = forwardRef<
  HTMLDivElement,
  RadioGroupProps & { width?: CSSProperties['width'] }
>(({ className, style, width, ...props }, ref) => {
  return (
    <RadixRadioGroup.Root
      ref={ref}
      className={clsx(styles.radioButtonGroup, className)}
      style={{ width, ...style }}
      {...props}
    ></RadixRadioGroup.Root>
  );
});
RadioButtonGroup.displayName = 'RadioButtonGroup';
