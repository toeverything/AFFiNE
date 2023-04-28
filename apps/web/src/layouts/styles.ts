import { styled } from '@affine/component';

export const StyledPage = styled('div')<{ resizing?: boolean }>(
  ({ theme, resizing }) => {
    return {
      cursor: resizing ? 'col-resize' : 'default',
      width: '100%',
      position: 'relative',
      height: '100vh',
      transition: 'background-color .5s',
      display: 'flex',
      flexGrow: '1',
      flexDirection: 'row',
      '--affine-editor-width': '686px',
      [theme.breakpoints.down('sm')]: {
        '--affine-editor-width': '550px',
      },
    };
  }
);

export const StyledSpacer = styled('div')<{
  sidebarOpen: boolean;
  resizing: boolean;
  floating: boolean;
}>(({ resizing, floating }) => {
  return {
    position: floating ? 'absolute' : 'relative',
    flexGrow: 1,
    height: '100%',
    maxWidth: floating ? 'calc(10vw + 400px)' : 'calc(100vw - 698px)',
    transition: resizing ? '' : 'width .3s, min-width .3s, max-width .3s',
  };
});

export const StyledWrapper = styled('div')(() => {
  return {
    flexGrow: 1,
    position: 'relative',
    overflow: 'auto',
  };
});

export const MainContainerWrapper = styled('div')(() => {
  return {
    display: 'flex',
    flexGrow: 1,
    position: 'relative',
    maxWidth: '100vw',
    overflow: 'auto',
  };
});

export const MainContainer = styled('div')(() => {
  return {
    position: 'relative',
    flexGrow: 1,
    maxWidth: '100%',
    backgroundColor: 'var(--affine-background-primary-color)',
  };
});

export const StyledToolWrapper = styled('div')(({ theme }) => {
  return {
    position: 'fixed',
    right: '30px',
    bottom: '30px',
    zIndex: 'var(--affine-z-index-popover)',
    [theme.breakpoints.down('md')]: {
      right: 'calc((100vw - 640px) * 3 / 19 + 5px)',
    },
    [theme.breakpoints.down('sm')]: {
      right: '5px',
      bottom: '5px',
    },
  };
});

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
      zIndex: 'var(--affine-z-index-modal)',
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
