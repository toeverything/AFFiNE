import { styled } from '@affine/component';

export const PageContainer = styled('div')(({ theme }) => {
  return {
    width: '100%',
    height: 'calc(100vh)',
    backgroundColor: theme.colors.pageBackground,
  };
});

export const NotFoundTitle = styled('h1')(({ theme }) => {
  return {
    position: 'relative',
    top: 'calc(50% - 100px)',
    height: '100px',
    fontSize: '60px',
    lineHeight: '100px',
    color: theme.colors.textColor,
    textAlign: 'center',
  };
});
