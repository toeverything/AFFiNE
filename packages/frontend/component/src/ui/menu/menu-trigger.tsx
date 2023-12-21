import { ArrowDownSmallIcon } from '@blocksuite/icons';
import { assignInlineVars } from '@vanilla-extract/dynamic';
import clsx from 'clsx';
import type { PropsWithChildren } from 'react';
import {
  type CSSProperties,
  forwardRef,
  type HTMLAttributes,
  type ReactNode,
} from 'react';

import { MenuIcon } from './menu-icon';
import * as styles from './styles.css';
import { triggerWidthVar } from './styles.css';

export interface MenuTriggerProps
  extends PropsWithChildren,
    HTMLAttributes<HTMLButtonElement> {
  width?: CSSProperties['width'];
  disabled?: boolean;
  noBorder?: boolean;
  status?: 'error' | 'success' | 'warning' | 'default';
  size?: 'default' | 'large' | 'extraLarge';
  preFix?: ReactNode;
  endFix?: ReactNode;
  block?: boolean;
}

export const MenuTrigger = forwardRef<HTMLButtonElement, MenuTriggerProps>(
  (
    {
      disabled,
      noBorder = false,
      className,
      status = 'default',
      size = 'default',
      preFix,
      endFix,
      block = false,
      children,
      width,
      style = {},
      ...otherProps
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        style={{
          ...assignInlineVars({
            [triggerWidthVar]: width
              ? typeof width === 'number'
                ? `${width}px`
                : width
              : 'auto',
          }),
          ...style,
        }}
        className={clsx(styles.menuTrigger, className, {
          // status
          block,
          disabled: disabled,
          'no-border': noBorder,
          // color
          error: status === 'error',
          success: status === 'success',
          warning: status === 'warning',
          default: status === 'default',
          // size
          large: size === 'large',
          'extra-large': size === 'extraLarge',
        })}
        {...otherProps}
      >
        {preFix}
        {children}
        {endFix}
        <MenuIcon position="end">
          <ArrowDownSmallIcon />
        </MenuIcon>
      </button>
    );
  }
);

MenuTrigger.displayName = 'MenuTrigger';
