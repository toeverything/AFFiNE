import { styled, displayFlex, fixedCenter } from '@/styles';

export const StyledEdgelessToolbar = styled.div(({ theme }) => ({
  height: '320px',
  position: 'fixed',
  left: '12px',
  top: 0,
  bottom: 0,
  margin: 'auto',
  zIndex: theme.zIndex.modal,
}));

export const StyledToolbarWrapper = styled.div(({ theme }) => ({
  width: '44px',
  borderRadius: '10px',
  boxShadow: theme.shadow.modal,
  padding: '4px',
  background: theme.colors.popoverBackground,
  transition: 'background .5s',
  marginBottom: '12px',
}));

export const StyledToolbarItem = styled.div<{ disable: boolean }>(
  ({ theme, disable }) => ({
    width: '36px',
    height: '36px',
    ...displayFlex('center', 'center'),
    color: disable ? '#C0C0C0' : theme.colors.iconColor,
    cursor: 'pointer',
    svg: {
      width: '36px',
      height: '36px',
    },
    ':hover': disable
      ? {}
      : {
          color: theme.colors.primaryColor,
          background: theme.colors.hoverBackground,
        },
  })
);
