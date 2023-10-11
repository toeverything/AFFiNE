// components/switch.tsx
import clsx from 'clsx';
import {
  type HTMLAttributes,
  type ReactNode,
  useCallback,
  useState,
} from 'react';

import * as styles from './index.css';

type SwitchProps = Omit<HTMLAttributes<HTMLLabelElement>, 'onChange'> & {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  children?: ReactNode;
};

export const Switch = ({
  checked: checkedProp = false,
  onChange: onChangeProp,
  children,
  ...otherProps
}: SwitchProps) => {
  const [checkedState, setCheckedState] = useState(checkedProp);

  const checked = onChangeProp ? checkedProp : checkedState;
  const onChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const newChecked = event.target.checked;
      if (onChangeProp) onChangeProp(newChecked);
      else setCheckedState(newChecked);
    },
    [onChangeProp]
  );

  return (
    <label className={clsx(styles.labelStyle)} {...otherProps}>
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
        })}
      />
    </label>
  );
};
