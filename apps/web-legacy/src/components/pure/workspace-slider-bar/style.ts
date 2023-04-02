import { displayFlex, styled } from '@affine/component';
import Link from 'next/link';

export const StyledSliderBarWrapper = styled('div')(() => {
  return {
    height: '100%',
    width: 'auto',
    position: 'relative',
  };
});

export const StyledSliderBar = styled('div')<{
  resizing: boolean;
  show: boolean;
  floating: boolean;
}>(({ theme, show, floating, resizing }) => {
  return {
    whiteSpace: 'nowrap',
    height: '100%',
    background: theme.colors.hubBackground,
    zIndex: theme.zIndex.modal,
    transition: !resizing ? 'width .15s, padding .15s' : '',
    padding: show ? '0 4px' : '0',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    position: floating ? 'absolute' : 'relative',
    maxWidth: floating ? undefined : 'calc(100vw - 698px)',
    borderRight: '1px solid',
    borderColor: theme.colors.borderColor,
  };
});
export const StyledSidebarSwitchWrapper = styled('div')(() => {
  return {
    height: '48px',
    flexShrink: 0,
    padding: '0 16px',
    ...displayFlex('flex-start', 'center'),
  };
});
export const StyledSliderBarInnerWrapper = styled('div')(() => {
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
export const StyledSliderModalBackground = styled('div')<{ active: boolean }>(
  ({ theme, active }) => {
    return {
      transition: 'opacity .15s',
      pointerEvents: active ? 'auto' : 'none',
      opacity: active ? 1 : 0,
      display: active ? 'block' : 'none',
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: theme.zIndex.modal - 1,
      background: theme.colors.modalBackground,
    };
  }
);
export const StyledSliderResizer = styled('div')<{ isResizing: boolean }>(
  ({ theme }) => {
    return {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      width: '12px',
      transform: 'translateX(50%)',
      cursor: 'col-resize',
      zIndex: theme.zIndex.modal + 1,
      userSelect: 'none',
      ':hover > *': {
        background: 'rgba(0, 0, 0, 0.1)',
      },
    };
  }
);
export const StyledSliderResizerInner = styled('div')<{ isResizing: boolean }>(
  ({ isResizing }) => {
    return {
      transition: 'background .15s .1s',
      position: 'absolute',
      top: 0,
      right: '50%',
      bottom: 0,
      transform: 'translateX(0.5px)',
      width: '2px',
      background: isResizing ? 'rgba(0, 0, 0, 0.1)' : 'transparent',
    };
  }
);
