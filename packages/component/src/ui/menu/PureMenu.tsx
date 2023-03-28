import type { CSSProperties } from 'react';

import type { PurePopperProps } from '../popper';
import { PurePopper } from '../popper';
import { StyledMenuWrapper } from './styles';

export const PureMenu = ({
  children,
  placement,
  width,
  ...otherProps
}: PurePopperProps & { width?: CSSProperties['width'] }) => {
  return (
    <PurePopper placement={placement} {...otherProps}>
      <StyledMenuWrapper width={width} placement={placement}>
        {children}
      </StyledMenuWrapper>
    </PurePopper>
  );
};
