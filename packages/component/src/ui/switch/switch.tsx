// components/switch.tsx
import clsx from 'clsx';
import { useState } from 'react';

import * as styles from './index.css';

type SwitchProps = {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  children?: React.ReactNode;
};

export const Switch = (props: SwitchProps) => {
  const { checked, onChange, children } = props;
  const [isChecked, setIsChecked] = useState(checked);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newChecked = event.target.checked;
    setIsChecked(newChecked);
    onChange?.(newChecked);
  };

  return (
    <label className={clsx(styles.labelStyle)}>
      {children}
      <input
        className={clsx(styles.inputStyle)}
        type="checkbox"
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
