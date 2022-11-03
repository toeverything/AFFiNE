import { displayFlex, styled } from '@/styles';
import { MenuItem } from '@/ui/menu';

export const StyledHeaderContainer = styled.div<{ hasWarning: boolean }>(
  ({ hasWarning }) => {
    return {
      position: 'relative',
      height: hasWarning ? '96px' : '60px',
    };
  }
);
export const StyledHeader = styled.div<{ hasWarning: boolean }>(
  ({ hasWarning, theme }) => {
    return {
      height: '60px',
      width: '100vw',
      ...displayFlex('space-between', 'center'),
      background: 'var(--affine-page-background)',
      transition: 'background-color 0.5s',
      position: 'fixed',
      left: '0',
      top: hasWarning ? '36px' : '0',
      padding: '0 22px',
      zIndex: 99,
    };
  }
);

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

export const StyledMenuItemWrapper = styled.div(({ theme }) => {
  return {
    height: '32px',
    position: 'relative',
    cursor: 'pointer',
    ...displayFlex('flex-start', 'center'),
    svg: {
      width: '16px',
      height: '16px',
      marginRight: '14px',
    },
    'svg:nth-child(2)': {
      position: 'absolute',
      right: 0,
      top: 0,
      bottom: 0,
      margin: 'auto',
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

export const StyledBrowserWarning = styled.div(({ theme }) => {
  return {
    backgroundColor: theme.colors.warningBackground,
    color: theme.colors.warningColor,
    height: '36px',
    width: '100vw',
    fontSize: theme.font.sm,
    position: 'fixed',
    left: '0',
    top: '0',
    ...displayFlex('center', 'center'),
  };
});

export const StyledCloseButton = styled.div(({ theme }) => {
  return {
    width: '36px',
    height: '36px',
    color: theme.colors.iconColor,
    cursor: 'pointer',
    ...displayFlex('center', 'center'),
    position: 'absolute',
    right: '15px',
    top: '0',

    svg: {
      width: '15px',
      height: '15px',
      position: 'relative',
      zIndex: 1,
    },
  };
});
