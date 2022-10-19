import { useState } from 'react';
import type { CSSProperties, PropsWithChildren, ReactNode } from 'react';
import Grow from '@mui/material/Grow';

import { styled } from '@/styles';

type PopoverProps = {
  popoverContent?: ReactNode;
  style?: CSSProperties;
};

const StyledPopoverContainer = styled('div')({
  position: 'relative',
  cursor: 'pointer',
});

const StyledPopoverWrapper = styled('div')({
  position: 'absolute',
  bottom: '0',
  right: '0',
  paddingTop: '46px',
  zIndex: 1000,
});
const StyledPopover = styled('div')(({ theme }) => {
  return {
    width: '248px',
    background: theme.colors.popoverBackground,
    boxShadow: theme.shadow.popover,
    color: theme.colors.popoverColor,
    borderRadius: '10px 0px 10px 10px',
    padding: '8px 4px',
    position: 'absolute',
    top: '46px',
    right: '0',
  };
});
export const Popover = ({
  children,
  popoverContent,
  style = {},
}: PropsWithChildren<PopoverProps>) => {
  const [show, setShow] = useState(false);
  return (
    <StyledPopoverContainer
      onClick={() => {
        setShow(!show);
      }}
      onMouseEnter={() => {
        setShow(true);
      }}
      onMouseLeave={() => {
        setShow(false);
      }}
      style={style}
    >
      {children}
      <Grow in={show}>
        <StyledPopoverWrapper>
          <StyledPopover>{popoverContent}</StyledPopover>
        </StyledPopoverWrapper>
      </Grow>
    </StyledPopoverContainer>
  );
};
