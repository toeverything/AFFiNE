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
    background: theme.colors.popoverBackground,
    padding: '8px 4px',
    fontSize: '14px',
    backgroundColor: theme.colors.popoverBackground,
    boxShadow: theme.shadow.popover,
  };
});

export const StyledStartIconWrapper = styled('div')(({ theme }) => {
  return {
    marginRight: '12px',
    fontSize: '20px',
    color: theme.colors.iconColor,
  };
});
export const StyledEndIconWrapper = styled('div')(({ theme }) => {
  return {
    marginLeft: '12px',
    fontSize: '20px',
    color: theme.colors.iconColor,
  };
});

export const StyledContent = styled('div')(({ theme }) => {
  return {
    textAlign: 'left',
    flexGrow: 1,
    fontSize: theme.font.base,
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
    fontSize: theme.font.base,
    height: '32px',
    ...displayFlex('flex-start', 'center'),
    cursor: isDir ? 'pointer' : '',
    position: 'relative',
    backgroundColor: 'transparent',
    color: disabled ? theme.colors.disableColor : theme.colors.textColor,
    svg: {
      color: disabled ? theme.colors.disableColor : theme.colors.iconColor,
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
          color: theme.colors.primaryColor,
          backgroundColor: theme.colors.hoverBackground,
          svg: {
            color: theme.colors.primaryColor,
          },
        },
  };
});
