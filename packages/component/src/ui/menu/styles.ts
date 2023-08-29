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
    minWidth: '200px',
    background: 'var(--affine-white)',
    padding: '8px 4px',
    fontSize: '14px',
    backgroundColor: 'var(--affine-white)',
    boxShadow: 'var(--affine-menu-shadow)',
    userSelect: 'none',
  };
});

export const StyledStartIconWrapper = styled('div')<{
  gap?: CSSProperties['gap'];
  iconSize?: CSSProperties['fontSize'];
}>(({ gap, iconSize }) => {
  return {
    display: 'flex',
    marginRight: gap ? gap : '12px',
    fontSize: iconSize ? iconSize : '20px',
    color: 'var(--affine-icon-color)',
  };
});
export const StyledEndIconWrapper = styled('div')<{
  gap?: CSSProperties['gap'];
  iconSize?: CSSProperties['fontSize'];
}>(({ gap, iconSize }) => {
  return {
    display: 'flex',
    marginLeft: gap ? gap : '12px',
    fontSize: iconSize ? iconSize : '20px',
    color: 'var(--affine-icon-color)',
  };
});

export const StyledContent = styled('div')<{
  fontSize?: CSSProperties['fontSize'];
}>(({ fontSize }) => {
  return {
    textAlign: 'left',
    flexGrow: 1,
    fontSize: fontSize ? fontSize : 'var(--affine-font-base)',
    ...textEllipsis(1),
  };
});

export const StyledMenuItem = styled('button')<{
  isDir?: boolean;
  disabled?: boolean;
  active?: boolean;
  disableHover?: boolean;
  userFocused?: boolean;
}>(({
  isDir = false,
  disabled = false,
  active = false,
  disableHover = false,
  userFocused = false,
}) => {
  return {
    width: '100%',
    borderRadius: '5px',
    padding: '0 14px',
    fontSize: 'var(--affine-font-sm)',
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
    ...(userFocused && !disabled
      ? {
          backgroundColor: 'var(--affine-hover-color)',
        }
      : {}),
    ...(active && !disabled
      ? {
          backgroundColor: 'var(--affine-hover-color)',
        }
      : {}),
  };
});
