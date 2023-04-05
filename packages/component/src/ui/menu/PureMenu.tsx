import type { CSSProperties } from 'react';

import type { PurePopperProps } from '../popper';
import { PurePopper } from '../popper';
import { StyledMenuWrapper } from './styles';

export type PureMenuProps = PurePopperProps & {
  width?: CSSProperties['width'];
  height?: CSSProperties['height'];
};
export const PureMenu = ({
  children,
  placement,
  width,
  height,
  ...otherProps
}: PureMenuProps) => {
  return (
    <PurePopper placement={placement} {...otherProps}>
      <StyledMenuWrapper width={width} placement={placement}>
        {children}
      </StyledMenuWrapper>
    </PurePopper>
  );
};
