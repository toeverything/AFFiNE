import { ArrowDownSmallIcon } from '@blocksuite/icons';
import {
  type ButtonHTMLAttributes,
  forwardRef,
  type MouseEventHandler,
} from 'react';

import * as styles from './styles.css';

type DropdownButtonProps = {
  onClickDropDown?: MouseEventHandler<HTMLElement>;
} & ButtonHTMLAttributes<HTMLButtonElement>;

export const DropdownButton = forwardRef<
  HTMLButtonElement,
  DropdownButtonProps
>(({ onClickDropDown, children, ...props }, ref) => {
  const handleClickDropDown: MouseEventHandler<HTMLElement> = e => {
    e.stopPropagation();
    onClickDropDown?.(e);
  };
  return (
    <button ref={ref} className={styles.dropdownBtn} {...props}>
      <span>{children}</span>
      <span className={styles.divider} />
      <span className={styles.dropdownWrapper} onClick={handleClickDropDown}>
        <ArrowDownSmallIcon className={styles.icon} width={16} height={16} />
      </span>
    </button>
  );
});
DropdownButton.displayName = 'DropdownButton';
