import type { CSSProperties } from 'react';

import { displayFlex, styled, textEllipsis } from '../../styles';
import StyledPopperContainer from '../shared/Container';

export const StyledMenuWrapper = styled(StyledPopperContainer)<{
  width?: CSSProperties['width'];
  height?: CSSProperties['height'];
}>(({ theme, width, height }) => {
  return {
    width,
    height,
    background: 'var(--affine-white)',
    padding: '8px 4px',
    fontSize: '14px',
    backgroundColor: 'var(--affine-white)',
    boxShadow: 'var(--affine-text-popover-shadow)',
  };
});

export const StyledStartIconWrapper = styled('div')(({ theme }) => {
  return {
    marginRight: '12px',
    fontSize: '20px',
    color: 'var(--affine-icon-color)',
  };
});
export const StyledEndIconWrapper = styled('div')(({ theme }) => {
  return {
    marginLeft: '12px',
    fontSize: '20px',
    color: 'var(--affine-icon-color)',
  };
});

export const StyledContent = styled('div')(({ theme }) => {
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
}>(({ theme, isDir = false, disabled = false }) => {
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

    ':hover': disabled
      ? {}
      : {
          color: 'var(--affine-primary-color)',
          backgroundColor: 'var(--affine-hover-color)',
          svg: {
            color: 'var(--affine-primary-color)',
          },
        },
  };
});
