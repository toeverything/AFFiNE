import { styled } from '@affine/component';

export const StyledPage = styled('div')(({ theme }) => {
  return {
    height: '100vh',
    backgroundColor: theme.colors.pageBackground,
    transition: 'background-color .5s',
    display: 'flex',
    flexGrow: '1',
    '--affine-editor-width': '686px',
    [theme.breakpoints.down('sm')]: {
      '--affine-editor-width': '550px',
    },
  };
});

export const StyledWrapper = styled('div')(() => {
  return {
    flexGrow: 1,
    position: 'relative',
    overflow: 'auto',
  };
});

export const MainContainer = styled('div')(({ theme }) => {
  return {
    position: 'relative',
    flexGrow: 1,
    [theme.breakpoints.up('md')]: {
      minWidth: '686px',
    },
  };
});

export const StyledToolWrapper = styled('div')(({ theme }) => {
  return {
    position: 'fixed',
    right: 'calc((100vw - 640px) * 3 / 19 + 5px)',
    bottom: '30px',
    zIndex: theme.zIndex.popover,
    [theme.breakpoints.down('md')]: {
      right: '30px',
    },
  };
});
