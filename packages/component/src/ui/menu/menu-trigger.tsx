import { ArrowDownSmallIcon } from '@blocksuite/icons';
import { Button, type ButtonProps } from '@toeverything/components/button';
import { forwardRef } from 'react';

export const MenuTrigger = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ children, ...props }, ref) => {
    return (
      <Button
        // type="plain"
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
