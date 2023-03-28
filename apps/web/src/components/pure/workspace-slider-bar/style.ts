import { displayFlex, styled } from '@affine/component';
import Link from 'next/link';
export const StyledSliderBar = styled('div')<{ show: boolean }>(
  ({ theme, show }) => {
    return {
      width: show ? '256px' : '0',
      whiteSpace: 'nowrap',
      height: '100vh',
      minHeight: '450px',
      background: theme.colors.hubBackground,
      boxShadow: theme.shadow.popover,
      transition: 'width .15s, padding .15s',
      position: 'relative',
      zIndex: theme.zIndex.modal,
      padding: show ? '0 4px' : '0',
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      [theme.breakpoints.down('sm')]: {
        position: 'absolute',
      },
    };
  }
);
export const StyledSidebarSwitchWrapper = styled('div')(() => {
  return {
    height: '48px',
    padding: '0 16px',
    ...displayFlex('flex-start', 'center'),
  };
});
export const StyledSlidebarWrapper = styled('div')(() => {
  return {
    flexGrow: 1,
    overflowX: 'hidden',
    overflowY: 'auto',
    position: 'relative',
  };
});

export const StyledLink = styled(Link)(() => {
  return {
    flexGrow: 1,
    textAlign: 'left',
    color: 'inherit',
    ...displayFlex('flex-start', 'center'),
    ':visited': {
      color: 'inherit',
    },
  };
});
export const StyledNewPageButton = styled('button')(({ theme }) => {
  return {
    height: '48px',
    ...displayFlex('flex-start', 'center'),
    borderTop: '1px solid',
    borderColor: theme.colors.borderColor,
    padding: '0 8px',
    svg: {
      fontSize: '20px',
      color: theme.colors.iconColor,
      marginRight: '8px',
    },
    ':hover': {
      color: theme.colors.primaryColor,
      svg: {
        color: theme.colors.primaryColor,
      },
    },
  };
});
