import { displayFlex, styled } from '@/styles';

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
      width: '100%',
      ...displayFlex('flex-end', 'center'),
      background: 'var(--affine-page-background)',
      transition: 'background-color 0.5s',
      position: 'absolute',
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

export const StyledHeaderRightSide = styled('div')({
  height: '100%',
  display: 'flex',
  alignItems: 'center',
});

export const StyledBrowserWarning = styled.div<{ show: boolean }>(
  ({ theme, show }) => {
    return {
      backgroundColor: theme.colors.warningBackground,
      color: theme.colors.warningColor,
      height: '36px',
      width: '100vw',
      fontSize: theme.font.sm,
      position: 'fixed',
      left: '0',
      top: '0',
      display: show ? 'flex' : 'none',
      justifyContent: 'center',
      alignItems: 'center',
    };
  }
);

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
