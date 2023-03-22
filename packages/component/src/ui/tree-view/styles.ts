import MuiCollapse from '@mui/material/Collapse';

import { styled } from '../../styles';

export const StyledCollapse = styled(MuiCollapse)(() => {
  return {
    paddingLeft: '12px',
  };
});
export const StyledTreeNodeContainer = styled('div')<{
  isOver?: boolean;
  canDrop?: boolean;
}>(({ isOver, canDrop, theme }) => {
  return {
    background: isOver && canDrop ? theme.colors.hoverBackground : '',
    position: 'relative',
  };
});
export const StyledTreeNodeItem = styled('div')<{ isDragging: boolean }>(
  ({ isDragging, theme }) => {
    return {
      background: isDragging ? theme.colors.hoverBackground : '',
    };
  }
);

export const StyledNodeLine = styled('div')<{ show: boolean }>(
  ({ show, theme }) => {
    return {
      position: 'absolute',
      left: '0',
      bottom: '0',
      width: '100%',
      paddingTop: '3px',
      borderBottom: '3px solid',
      borderColor: show ? theme.colors.primaryColor : 'transparent',
    };
  }
);
