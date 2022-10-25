import { displayFlex, styled } from '@/styles';

export const StyledHeader = styled('div')({
  height: '60px',
  width: '100vw',
  ...displayFlex('space-between', 'center'),
  background: 'var(--affine-page-background)',
  transition: 'background-color 0.5s',
  position: 'fixed',
  left: '0',
  top: '0',
  padding: '0 22px',
  zIndex: '10',
});

export const StyledTitle = styled('div')(({ theme }) => ({
  width: '720px',
  height: '100%',
  position: 'absolute',
  left: 0,
  right: 0,
  top: 0,
  margin: 'auto',

  ...displayFlex('center', 'center'),
  fontSize: theme.font.base,
}));

export const StyledTitleWrapper = styled('div')({
  maxWidth: '720px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  position: 'relative',
});

export const StyledLogo = styled('div')(({ theme }) => ({
  color: theme.colors.primaryColor,
  width: '60px',
  height: '60px',
  cursor: 'pointer',
  marginLeft: '-22px',
  ...displayFlex('center', 'center'),
}));

export const StyledHeaderRightSide = styled('div')({
  height: '100%',
  display: 'flex',
  alignItems: 'center',
});

export const StyledMoreMenuItem = styled('div')(({ theme }) => {
  return {
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    borderRadius: '5px',
    fontSize: '14px',
    color: theme.colors.popoverColor,
    padding: '0 14px',
    svg: {
      width: '16px',
      height: '16px',
      marginRight: '14px',
    },
    ':hover': {
      color: theme.colors.primaryColor,
      background: theme.colors.hoverBackground,
    },
  };
});

export const IconButton = styled('div')(({ theme }) => {
  return {
    width: '32px',
    height: '32px',
    ...displayFlex('center', 'center'),
    color: theme.colors.iconColor,
    borderRadius: '5px',
    ':hover': {
      color: theme.colors.primaryColor,
      background: theme.colors.hoverBackground,
    },
  };
});
