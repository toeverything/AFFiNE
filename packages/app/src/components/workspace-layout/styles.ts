import { styled } from '@/styles';

export const StyledPage = styled('div')(({ theme }) => {
  return {
    height: '100vh',
    backgroundColor: theme.colors.pageBackground,
    transition: 'background-color .5s',
    display: 'flex',
    flexGrow: '1',
  };
});

export const StyledWrapper = styled('div')(({ theme }) => {
  return {
    flexGrow: 1,
    position: 'relative',
  };
});
