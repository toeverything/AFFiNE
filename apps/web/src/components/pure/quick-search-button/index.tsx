import { IconButton, IconButtonProps } from '@affine/component';
import { styled } from '@affine/component';
import { ArrowDownSmallIcon } from '@blocksuite/icons';

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

// fixme(himself65): need to refactor
export const QuickSearchButton = ({
  onClick,
  ...props
}: Omit<IconButtonProps, 'children'>) => {
  return (
    <StyledIconButtonWithAnimate
      data-testid="header-quickSearchButton"
      {...props}
      onClick={e => {
        onClick?.(e);
      }}
    >
      <ArrowDownSmallIcon />
    </StyledIconButtonWithAnimate>
  );
};
