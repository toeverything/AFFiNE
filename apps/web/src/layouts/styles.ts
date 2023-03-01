import { styled } from '@affine/component';

export const StyledPage = styled('div')(({ theme }) => {
  return {
    height: '100vh',
    minHeight: '450px',
    backgroundColor: theme.colors.pageBackground,
    transition: 'background-color .5s',
    display: 'flex',
    flexGrow: '1',
  };
});

export const StyledWrapper = styled('div')(() => {
  return {
    flexGrow: 1,
    position: 'relative',
    overflow: 'auto',
  };
});

export const StyledToolWrapper = styled('div')(({ theme }) => {
  return {
    position: 'fixed',
    right: '30px',
    bottom: '30px',
    zIndex: theme.zIndex.popover,
  };
});
