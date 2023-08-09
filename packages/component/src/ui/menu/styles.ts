import type { CSSProperties } from 'react';

import { displayFlex, styled, textEllipsis } from '../../styles';
import StyledPopperContainer from '../shared/container';

export const StyledMenuWrapper = styled(StyledPopperContainer, {
  shouldForwardProp: propName =>
    !['width', 'height'].includes(propName as string),
})<{
  width?: CSSProperties['width'];
  height?: CSSProperties['height'];
}>(({ width, height }) => {
  return {
    width,
    height,
    background: 'var(--affine-white)',
    padding: '8px 4px',
    fontSize: '14px',
    backgroundColor: 'var(--affine-white)',
    boxShadow: 'var(--affine-menu-shadow)',
    userSelect: 'none',
  };
});

export const StyledStartIconWrapper = styled('div')(() => {
  return {
    display: 'flex',
    marginRight: '12px',
    fontSize: '20px',
    color: 'var(--affine-icon-color)',
  };
});
export const StyledEndIconWrapper = styled('div')(() => {
  return {
    display: 'flex',
    marginLeft: '12px',
    fontSize: '20px',
    color: 'var(--affine-icon-color)',
  };
});

export const StyledContent = styled('div')(() => {
  return {
    textAlign: 'left',
    flexGrow: 1,
    fontSize: 'var(--affine-font-base)',
    ...textEllipsis(1),
  };
});

export const StyledMenuItem = styled('button')<{
  isDir?: boolean;
  disabled?: boolean;
  active?: boolean;
  disableHover?: boolean;
}>(({
  isDir = false,
  disabled = false,
  active = false,
  disableHover = false,
}) => {
  return {
    width: '100%',
    borderRadius: '5px',
    padding: '0 14px',
    fontSize: 'var(--affine-font-base)',
    height: '32px',
    ...displayFlex('flex-start', 'center'),
    cursor: isDir ? 'pointer' : '',
    position: 'relative',
    backgroundColor: 'transparent',
    color: disabled
      ? 'var(--affine-text-disable-color)'
      : 'var(--affine-text-primary-color)',
    svg: {
      color: disabled
        ? 'var(--affine-text-disable-color)'
        : 'var(--affine-icon-color)',
    },
    ...(disabled
      ? {
          cursor: 'not-allowed',
          pointerEvents: 'none',
        }
      : {}),

    ':hover':
      disabled || disableHover
        ? {}
        : {
            backgroundColor: 'var(--affine-hover-color)',
          },

    ...(active && !disabled
      ? {
          backgroundColor: 'var(--affine-hover-color)',
        }
      : {}),
  };
});
