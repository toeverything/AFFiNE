import { ArrowDownSmallIcon } from '@blocksuite/icons';
import { forwardRef } from 'react';

import { Button, type ButtonProps } from '../button';

export const MenuTrigger = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ children, ...props }, ref) => {
    return (
      <Button
        type="plain"
        ref={ref}
        icon={<ArrowDownSmallIcon />}
        iconPosition="end"
        {...props}
      >
        {children}
      </Button>
    );
  }
);
MenuTrigger.displayName = 'MenuTrigger';
