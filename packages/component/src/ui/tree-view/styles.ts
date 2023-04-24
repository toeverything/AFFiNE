import MuiCollapse from '@mui/material/Collapse';
import type { CSSProperties } from 'react';

import { alpha, lightTheme, styled } from '../../styles';

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
  ({ isDragging = false }) => {
    return {
      background: isDragging ? 'var(--affine-hover-color)' : '',
    };
  }
);

export const StyledNodeLine = styled('div')<{
  isOver: boolean;
  isTop?: boolean;
}>(({ isOver, isTop = false }) => {
  return {
    position: 'absolute',
    left: '0',
    ...(isTop ? { top: '-1px' } : { bottom: '-1px' }),
    width: '100%',
    paddingTop: '2x',
    borderTop: '2px solid',
    borderColor: isOver ? 'var(--affine-primary-color)' : 'transparent',
    boxShadow: isOver
      ? `0px 0px 8px ${alpha(lightTheme.primaryColor, 0.35)}`
      : 'none',
    zIndex: 1,
  };
});
