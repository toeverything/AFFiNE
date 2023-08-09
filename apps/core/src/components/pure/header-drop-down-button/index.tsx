import { styled } from '@affine/component';
import { ArrowDownSmallIcon } from '@blocksuite/icons';
import {
  IconButton,
  type IconButtonProps,
} from '@toeverything/components/button';

const StyledIconButtonWithAnimate = styled(IconButton)(() => {
  return {
    svg: {
      transition: 'transform 0.15s ease-in-out',
    },
    ':hover': {
      svg: {
        transform: 'translateY(3px)',
      },
      backgroundColor: 'transparent !important',
    },
  };
});

// fixme(himself65): need to refactor
export const HeaderDropDownButton = ({
  onClick,
  ...props
}: Omit<IconButtonProps, 'children'>) => {
  return (
    <StyledIconButtonWithAnimate
      data-testid="header-dropDownButton"
      {...props}
      onClick={e => {
        onClick?.(e);
      }}
    >
      <ArrowDownSmallIcon />
    </StyledIconButtonWithAnimate>
  );
};
