import React from 'react';
import { IconButton, IconButtonProps } from '@affine/component';
import { ArrowDownIcon } from '@blocksuite/icons';
import { useModal } from '@/store/globalModal';
import { styled } from '@affine/component';

const StyledIconButtonWithAnimate = styled(IconButton)(({ theme }) => {
  return {
    svg: {
      transition: 'transform 0.15s ease-in-out',
    },
    ':hover': {
      svg: {
        transform: 'translateY(3px)',
      },
      '::after': {
        background: theme.colors.pageBackground,
      },
    },
  };
});
export const QuickSearchButton = ({
  onClick,
  ...props
}: Omit<IconButtonProps, 'children'>) => {
  const { triggerQuickSearchModal } = useModal();
  return (
    <StyledIconButtonWithAnimate
      data-testid="header-quickSearchButton"
      {...props}
      onClick={e => {
        onClick?.(e);
        triggerQuickSearchModal();
      }}
    >
      <ArrowDownIcon />
    </StyledIconButtonWithAnimate>
  );
};

export default QuickSearchButton;
