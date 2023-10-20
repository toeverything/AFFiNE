// components/checkbox.tsx
import clsx from 'clsx';
import { type HTMLAttributes, useCallback, useEffect, useRef } from 'react';

import * as icons from './icons';
import * as styles from './index.css';

type CheckboxProps = Omit<HTMLAttributes<HTMLInputElement>, 'onChange'> & {
  checked: boolean;
  onChange: (
    event: React.ChangeEvent<HTMLInputElement>,
    checked: boolean
  ) => void;
  disabled?: boolean;
  intermediate?: boolean;
};

export const Checkbox = ({
  checked,
  onChange,
  intermediate,
  disabled,
  ...otherProps
}: CheckboxProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const newChecked = event.target.checked;
      onChange(event, newChecked);
      const inputElement = inputRef.current;
      if (newChecked && inputElement) {
        playCheckAnimation(inputElement.parentElement as Element).catch(
          console.error
        );
      }
    },
    [onChange]
  );

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = !!intermediate;
    }
  }, [intermediate]);

  const icon = intermediate
    ? icons.intermediate
    : checked
    ? icons.checked
    : icons.unchecked;

  return (
    <div
      className={clsx(styles.root, disabled && styles.disabled)}
      {...otherProps}
    >
      {icon}
      <input
        ref={inputRef}
        data-testid="affine-checkbox"
        className={clsx(styles.input)}
        type="checkbox"
        value={checked ? 'on' : 'off'}
        checked={checked}
        onChange={handleChange}
      />
    </div>
  );
};

export const playCheckAnimation = async (refElement: Element) => {
  const sparkingEl = document.createElement('div');
  sparkingEl.classList.add('affine-check-animation');
  sparkingEl.style.cssText = `
    position: absolute;
    width: 1em;
    height: 1em;
    border-radius: 50%;
    font-size: inherit;
  `;
  refElement.appendChild(sparkingEl);

  await sparkingEl.animate(
    [
      {
        offset: 0.5,
        boxShadow:
          '0 -18px 0 -8px #1e96eb, 16px -8px 0 -8px #1e96eb, 16px 8px 0 -8px #1e96eb, 0 18px 0 -8px #1e96eb, -16px 8px 0 -8px #1e96eb, -16px -8px 0 -8px #1e96eb',
      },
      {
        offset: 1,
        boxShadow:
          '0 -32px 0 -10px transparent, 32px -16px 0 -10px transparent, 32px 16px 0 -10px transparent, 0 36px 0 -10px transparent, -32px 16px 0 -10px transparent, -32px -16px 0 -10px transparent',
      },
    ],
    { duration: 500, easing: 'ease', fill: 'forwards' }
  ).finished;

  sparkingEl.remove();
};
