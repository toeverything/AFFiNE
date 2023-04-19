import MuiCollapse from '@mui/material/Collapse';
import type { CSSProperties } from 'react';

import { alpha, styled } from '../../styles';

export const StyledCollapse = styled(MuiCollapse)<{
  indent?: CSSProperties['paddingLeft'];
}>(({ indent = 12 }) => {
  return {
    paddingLeft: indent,
  };
});
export const StyledTreeNodeWrapper = styled('div')(() => {
  return {
    position: 'relative',
  };
});
export const StyledTreeNodeContainer = styled('div')<{ isDragging?: boolean }>(
  ({ isDragging = false, theme }) => {
    return {
      background: isDragging ? theme.colors.hoverBackground : '',
    };
  }
);

export const StyledNodeLine = styled('div')<{
  isOver?: boolean;
  isTop?: boolean;
}>(({ isOver = false, isTop = false, theme }) => {
  return {
    position: 'absolute',
    left: '0',
    ...(isTop ? { top: '-1px' } : { bottom: '-1px' }),
    width: '100%',
    borderTop: '2px solid',
    borderColor: isOver ? theme.colors.primaryColor : 'transparent',
    boxShadow: isOver
      ? `0px 0px 8px ${alpha(theme.colors.primaryColor, 0.35)}`
      : 'none',
    zIndex: 1,
  };
});
