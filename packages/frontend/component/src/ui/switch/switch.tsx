// components/switch.tsx
import clsx from 'clsx';
import type { HTMLAttributes, ReactNode } from 'react';
import { useCallback, useState } from 'react';

import * as styles from './index.css';

export type SwitchProps = Omit<HTMLAttributes<HTMLLabelElement>, 'onChange'> & {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  children?: ReactNode;
  disabled?: boolean;
};

export const Switch = ({
  checked: checkedProp = false,
  onChange: onChangeProp,
  children,
  className,
  disabled,
  ...otherProps
}: SwitchProps) => {
  const [checkedState, setCheckedState] = useState(checkedProp);

  const checked = onChangeProp ? checkedProp : checkedState;
  const onChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      if (disabled) {
        return;
      }
      const newChecked = event.target.checked;
      if (onChangeProp) onChangeProp(newChecked);
      else setCheckedState(newChecked);
    },
    [disabled, onChangeProp]
  );

  return (
    <label className={clsx(styles.labelStyle, className)} {...otherProps}>
      {children}
      <input
        className={clsx(styles.inputStyle)}
        type="checkbox"
        value={checked ? 'on' : 'off'}
        checked={checked}
        onChange={onChange}
      />
      <span
        className={clsx(styles.switchStyle, {
          [styles.switchCheckedStyle]: checked,
          [styles.switchDisabledStyle]: disabled,
        })}
      />
    </label>
  );
};
