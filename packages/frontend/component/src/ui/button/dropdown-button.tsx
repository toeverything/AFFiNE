import { ArrowDownSmallIcon } from '@blocksuite/icons/rc';
import clsx from 'clsx';
import type { ButtonHTMLAttributes, MouseEventHandler } from 'react';
import { forwardRef } from 'react';

import * as styles from './styles.css';

type DropdownButtonProps = {
  size?: 'small' | 'default';
  onClickDropDown?: MouseEventHandler<HTMLElement>;
} & ButtonHTMLAttributes<HTMLButtonElement>;

export const DropdownButton = forwardRef<
  HTMLButtonElement,
  DropdownButtonProps
>(
  (
    { onClickDropDown, children, size = 'default', className, ...props },
    ref
  ) => {
    const handleClickDropDown: MouseEventHandler<HTMLElement> = e => {
      e.stopPropagation();
      onClickDropDown?.(e);
    };
    return (
      <button
        ref={ref}
        data-size={size}
        className={clsx(styles.dropdownBtn, className)}
        {...props}
      >
        <span>{children}</span>
        <span className={styles.divider} />
        <span className={styles.dropdownWrapper} onClick={handleClickDropDown}>
          <ArrowDownSmallIcon
            className={styles.dropdownIcon}
            width={16}
            height={16}
          />
        </span>
      </button>
    );
  }
);
DropdownButton.displayName = 'DropdownButton';
