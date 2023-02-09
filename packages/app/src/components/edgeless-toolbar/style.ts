import { styled, displayFlex } from '@affine/component';

export const StyledEdgelessToolbar = styled.div(({ theme }) => ({
  height: '320px',
  position: 'absolute',
  left: '12px',
  top: 0,
  bottom: 0,
  margin: 'auto',
  zIndex: theme.zIndex.modal - 1,
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

export const StyledToolbarItem = styled.div<{
  disable?: boolean;
}>(({ theme, disable = false }) => ({
  width: '36px',
  height: '36px',
  ...displayFlex('center', 'center'),
  color: disable ? theme.colors.disableColor : theme.colors.iconColor,
  cursor: disable ? 'not-allowed' : 'pointer',
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
}));
