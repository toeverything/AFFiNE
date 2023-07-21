import { ArrowDownSmallIcon } from '@blocksuite/icons';
import { forwardRef } from 'react';

import type { ButtonProps } from '../button';
import { Button } from '../button';
export const MenuTrigger = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ children, ...props }, ref) => {
    return (
      <Button
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
