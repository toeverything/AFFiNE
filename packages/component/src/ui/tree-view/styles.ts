import MuiCollapse from '@mui/material/Collapse';
import type { CSSProperties } from 'react';

import { styled } from '../../styles';

export const StyledCollapse = styled(MuiCollapse)<{
  indent?: CSSProperties['paddingLeft'];
}>(({ indent = 12 }) => {
  return {
    paddingLeft: indent,
  };
});
export const StyledTreeNodeItem = styled('div')<{
  isOver?: boolean;
  canDrop?: boolean;
}>(({ isOver, canDrop, theme }) => {
  return {
    background: isOver && canDrop ? theme.colors.hoverBackground : '',
    position: 'relative',
  };
});
export const StyledTreeNodeContainer = styled('div')<{ isDragging: boolean }>(
  ({ isDragging, theme }) => {
    return {
      background: isDragging ? theme.colors.hoverBackground : '',
    };
  }
);

export const StyledNodeLine = styled('div')<{ show: boolean; isTop?: boolean }>(
  ({ show, isTop = false, theme }) => {
    return {
      position: 'absolute',
      left: '0',
      ...(isTop ? { top: '0' } : { bottom: '0' }),
      width: '100%',
      paddingTop: '3px',
      borderBottom: '3px solid',
      borderColor: show ? theme.colors.primaryColor : 'transparent',
      zIndex: 1,
    };
  }
);
