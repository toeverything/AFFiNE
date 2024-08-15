import { ArrowDownSmallIcon } from '@blocksuite/icons/rc';
import clsx from 'clsx';
import { forwardRef, type Ref } from 'react';

import { Button, type ButtonProps } from '../button';

export interface MenuTriggerProps extends ButtonProps {}

export const MenuTrigger = forwardRef(function MenuTrigger(
  { children, className, contentStyle, ...otherProps }: MenuTriggerProps,
  ref: Ref<HTMLButtonElement>
) {
  return (
    <Button
      ref={ref}
      suffix={<ArrowDownSmallIcon />}
      className={clsx(className)}
      contentStyle={{ width: 0, flex: 1, textAlign: 'start', ...contentStyle }}
      {...otherProps}
    >
      {children}
    </Button>
  );
});
