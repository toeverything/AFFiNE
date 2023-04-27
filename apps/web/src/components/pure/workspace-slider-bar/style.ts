import { displayFlex, styled, textEllipsis } from '@affine/component';
import { baseTheme } from '@toeverything/theme';
import Link from 'next/link';

const macosElectron = environment.isDesktop && environment.isMacOs;

export const StyledSliderBarWrapper = styled('div')<{
  show: boolean;
  floating: boolean;
  resizing: boolean;
}>(({ theme, show, floating, resizing }) => {
  return {
    height: '100%',
    position: 'absolute',
    'button, a': {
      userSelect: 'none',
    },
    zIndex: 'var(--affine-z-index-modal)',
    transition: resizing ? '' : 'transform .3s, width .3s, max-width .3s',
    transform: show ? 'translateX(0)' : 'translateX(-100%)',
    maxWidth: floating ? 'calc(10vw + 400px)' : 'calc(100vw - 698px)',
    background:
      !floating && macosElectron
        ? 'transparent'
        : 'var(--affine-background-secondary-color)',
    borderRight: macosElectron ? '' : '1px solid',
    borderColor: 'var(--affine-border-color)',
  };
});

export const StyledSliderBar = styled('div')(() => {
  return {
    whiteSpace: 'nowrap',
    width: '100%',
    height: '100%',
    padding: '0 4px',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
  };
});
export const StyledSidebarHeader = styled('div')(() => {
  return {
    height: '52px',
    flexShrink: 0,
    padding: '0 16px 0 10px',
    WebkitAppRegion: 'drag',
    button: {
      WebkitAppRegion: 'no-drag',
    },
    ...displayFlex(macosElectron ? 'flex-end' : 'space-between', 'center'),
  };
});
export const StyledSliderBarInnerWrapper = styled('div')(() => {
  return {
    flexGrow: 1,
    // overflowX: 'hidden',
    // overflowY: 'auto',
    position: 'relative',
    height: 'calc(100% - 52px * 2)',
    display: 'flex',
    flexDirection: 'column',
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
    overflow: 'hidden',
    div: {
      wordBreak: 'break-all',
      wordWrap: 'break-word',
      whiteSpace: 'nowrap',
      ...textEllipsis(1),
    },
    userDrag: 'none',
    userSelect: 'none',
    appRegion: 'no-drag',
    '-webkit-user-select': 'none',
    '-webkit-user-drag': 'none',
    '-webkit-app-region': 'no-drag',
  };
});
export const StyledNewPageButton = styled('button')(({ theme }) => {
  return {
    height: '52px',
    ...displayFlex('flex-start', 'center'),
    borderTop: '1px solid',
    borderColor: 'var(--affine-border-color)',
    padding: '0 8px 0 16px',
    svg: {
      fontSize: '20px',
      color: 'var(--affine-icon-color)',
      marginRight: '8px',
    },
    ':hover': {
      color: 'var(--affine-primary-color)',
      svg: {
        color: 'var(--affine-primary-color)',
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
      position: 'fixed',
      top: 0,
      left: 0,
      right: active ? 0 : '100%',
      bottom: 0,
      zIndex: parseInt(baseTheme.zIndexModal) - 1,
      background: 'var(--affine-background-modal-color)',
    };
  }
);

export const StyledScrollWrapper = styled('div')<{
  showTopBorder: boolean;
}>(({ showTopBorder, theme }) => {
  return {
    maxHeight: '50%',
    overflowY: 'auto',
    borderTop: '1px solid',
    borderColor: showTopBorder ? 'var(--affine-border-color)' : 'transparent',
  };
});
