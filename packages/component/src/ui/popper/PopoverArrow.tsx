import type { CSSProperties } from 'react';
import { forwardRef } from 'react';

import { styled } from '../../styles';
import type { PopperArrowProps } from './interface';

export const PopperArrow = forwardRef<HTMLElement, PopperArrowProps>(
  function PopperArrow({ placement }, ref) {
    return <StyledArrow placement={placement} ref={ref} />;
  }
);

const getArrowStyle = (
  placement: PopperArrowProps['placement'] = 'bottom',
  backgroundColor: CSSProperties['backgroundColor']
) => {
  if (placement.indexOf('bottom') === 0) {
    return {
      top: 0,
      left: 0,
      marginTop: '-0.9em',
      width: '3em',
      height: '1em',
      '&::before': {
        borderWidth: '0 1em 1em 1em',
        borderColor: `transparent transparent ${backgroundColor} transparent`,
      },
    };
  }

  if (placement.indexOf('top') === 0) {
    return {
      bottom: 0,
      left: 0,
      marginBottom: '-0.9em',
      width: '3em',
      height: '1em',
      '&::before': {
        borderWidth: '1em 1em 0 1em',
        borderColor: `${backgroundColor} transparent transparent transparent`,
      },
    };
  }
  if (placement.indexOf('left') === 0) {
    return {
      right: 0,
      marginRight: '-0.9em',
      height: '3em',
      width: '1em',
      '&::before': {
        borderWidth: '1em 0 1em 1em',
        borderColor: `transparent transparent transparent ${backgroundColor}`,
      },
    };
  }
  if (placement.indexOf('right') === 0) {
    return {
      left: 0,
      marginLeft: '-0.9em',
      height: '3em',
      width: '1em',
      '&::before': {
        borderWidth: '1em 1em 1em 0',
        borderColor: `transparent ${backgroundColor} transparent transparent`,
      },
    };
  }

  return {
    display: 'none',
  };
};

const StyledArrow = styled('span')<{
  placement?: PopperArrowProps['placement'];
}>(({ placement, theme }) => {
  return {
    position: 'absolute',
    fontSize: '7px',
    width: '3em',
    '::before': {
      content: '""',
      margin: 'auto',
      display: 'block',
      width: 0,
      height: 0,
      borderStyle: 'solid',
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
    },

    ...getArrowStyle(placement, 'var(--affine-tooltip)'),
  };
});
