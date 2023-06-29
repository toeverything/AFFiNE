import { ArrowDownSmallIcon } from '@blocksuite/icons';
import { forwardRef } from 'react';

import type { ButtonProps } from '../button';
import { StyledButton } from './styles';

export const MenuTrigger = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ children, ...props }, ref) => {
    return (
      <StyledButton
        ref={ref}
        icon={<ArrowDownSmallIcon />}
        iconPosition="end"
        noBorder={true}
        {...props}
      >
        {children}
      </StyledButton>
    );
  }
);
MenuTrigger.displayName = 'MenuTrigger';
