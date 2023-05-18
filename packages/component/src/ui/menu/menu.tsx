import type { TooltipProps } from '@mui/material';
import type { CSSProperties } from 'react';

import { Popper, type PopperProps } from '../popper';
import { StyledMenuWrapper } from './styles';

export type MenuProps = {
  width?: CSSProperties['width'];
  menuStyles?: CSSProperties;
} & PopperProps &
  Omit<TooltipProps, 'title' | 'content' | 'placement'>;
export const Menu = (props: MenuProps) => {
  const {
    width,
    menuStyles,
    content,
    placement = 'bottom-start',
    children,
  } = props;
  return content ? (
    <Popper
      {...props}
      showArrow={false}
      content={
        <StyledMenuWrapper
          width={width}
          placement={placement}
          style={menuStyles}
        >
          {content}
        </StyledMenuWrapper>
      }
    >
      {children}
    </Popper>
  ) : null;
};

export default Menu;
