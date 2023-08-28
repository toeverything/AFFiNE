// components/switch.tsx
import clsx from 'clsx';
import { type HTMLAttributes, type ReactNode, useState } from 'react';

import * as styles from './index.css';

type SwitchProps = Omit<HTMLAttributes<HTMLLabelElement>, 'onChange'> & {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  children?: ReactNode;
};

export const Switch = (props: SwitchProps) => {
  const { checked, onChange, children, ...otherProps } = props;
  const [isChecked, setIsChecked] = useState(checked);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newChecked = event.target.checked;
    setIsChecked(newChecked);
    onChange?.(newChecked);
  };

  return (
    <label className={clsx(styles.labelStyle)} {...otherProps}>
      {children}
      <input
        className={clsx(styles.inputStyle)}
        type="checkbox"
        value={isChecked ? 'on' : 'off'}
        checked={isChecked}
        onChange={handleChange}
      />
      <span
        className={clsx(styles.switchStyle, {
          [styles.switchCheckedStyle]: isChecked,
        })}
      />
    </label>
  );
};
