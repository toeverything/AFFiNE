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
  ({ isDragging = false, theme }) => {
    return {
      background: isDragging ? 'var(--affine-hover-color)' : '',
      // opacity: isDragging ? 0.4 : 1,
    };
  }
);

export const StyledNodeLine = styled('div')<{ show: boolean; isTop?: boolean }>(
  ({ show, isTop = false, theme }) => {
    return {
      position: 'absolute',
      left: '0',
      ...(isTop ? { top: '-1px' } : { bottom: '-1px' }),
      width: '100%',
      paddingTop: '2x',
      borderTop: '2px solid',
      borderColor: show ? 'var(--affine-primary-color)' : 'transparent',
      boxShadow: show
        ? `0px 0px 8px ${alpha(lightTheme.primaryColor, 0.35)}`
        : 'none',
      zIndex: 1,
    };
  }
);
