import clsx from 'clsx';
import { type HTMLAttributes, useId } from 'react';

import * as styles from './simple-color-picker.css';

export const SimpleColorPicker = ({
  value,
  setValue,
  className,
  ...attrs
}: HTMLAttributes<HTMLDivElement> & {
  value: string;
  setValue: (value: string) => void;
}) => {
  const id = useId();
  return (
    <label htmlFor={id}>
      <div
        style={{ backgroundColor: value }}
        className={clsx(styles.wrapper, className)}
        {...attrs}
      >
        <input
          className={styles.input}
          type="color"
          name={id}
          id={id}
          value={value}
          onChange={e => setValue(e.target.value)}
        />
      </div>
    </label>
  );
};
