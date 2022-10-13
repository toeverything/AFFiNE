import { useState } from 'react';
import type { PropsWithChildren } from 'react';
import { styled } from '@/styles';

type PopoverProps = {
  popoverContent?: React.ReactNode;
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
});
const StyledPopover = styled('div')<{ show: boolean }>(({ show }) => {
  return {
    width: '248px',
    background: '#fff',
    boxShadow:
      '0px 1px 10px -6px rgba(24, 39, 75, 0.5), 0px 3px 16px -6px rgba(24, 39, 75, 0.04)',
    borderRadius: '10px 0px 10px 10px',
    padding: '8px 4px',
    display: show ? 'block' : 'none',
    position: 'absolute',
    top: '46px',
    right: '0',
  };
});
export const Popover = ({
  children,
  popoverContent,
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
    >
      {children}
      <StyledPopoverWrapper>
        <StyledPopover show={show}>{popoverContent}</StyledPopover>
      </StyledPopoverWrapper>
    </StyledPopoverContainer>
  );
};
