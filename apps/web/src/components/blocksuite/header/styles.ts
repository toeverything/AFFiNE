import {
  absoluteCenter,
  displayFlex,
  styled,
  textEllipsis,
} from '@affine/component';

export const StyledHeaderContainer = styled('div')<{ hasWarning: boolean }>(
  ({ hasWarning }) => {
    return {
      height: hasWarning ? '96px' : '60px',
    };
  }
);
export const StyledHeader = styled('div')<{ hasWarning: boolean }>(
  ({ theme }) => {
    return {
      height: '64px',
      width: '100%',
      padding: '0 28px',
      ...displayFlex('flex-end', 'center'),
      background: theme.colors.pageBackground,
      transition: 'background-color 0.5s',
      zIndex: 99,
      position: 'relative',
    };
  }
);

export const StyledTitleContainer = styled('div')(({ theme }) => ({
  width: '720px',
  height: '100%',

  margin: 'auto',
  ...absoluteCenter({ horizontal: true, position: { top: 0 } }),
  ...displayFlex('center', 'center'),
  fontSize: theme.font.base,
}));

export const StyledTitle = styled('div')(() => {
  return {
    maxWidth: '620px',
    ...textEllipsis(1),
  };
});

export const StyledTitleWrapper = styled('div')({
  maxWidth: '720px',
  height: '100%',
  position: 'relative',
  ...displayFlex('center', 'center'),
});

export const StyledHeaderRightSide = styled('div')({
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  '>*:not(:last-child)': {
    marginRight: '12px',
  },
});

export const StyledBrowserWarning = styled('div')<{ show: boolean }>(
  ({ theme, show }) => {
    return {
      backgroundColor: theme.colors.warningBackground,
      color: theme.colors.warningColor,
      height: '36px',
      fontSize: theme.font.sm,
      display: show ? 'flex' : 'none',
      justifyContent: 'center',
      alignItems: 'center',
    };
  }
);

export const StyledCloseButton = styled('div')(({ theme }) => {
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

export const StyledSwitchWrapper = styled('div')(() => {
  return {
    position: 'absolute',
    right: '100%',
    top: 0,
    bottom: 0,
    margin: 'auto',
    ...displayFlex('center', 'center'),
  };
});

export const StyledSearchArrowWrapper = styled('div')(() => {
  return {
    position: 'absolute',
    left: 'calc(100% + 4px)',
    top: 0,
    bottom: 0,
    margin: 'auto',
    ...displayFlex('center', 'center'),
  };
});

export const StyledPageListTittleWrapper = styled(StyledTitle)(({ theme }) => {
  return {
    fontSize: theme.font.base,
    color: theme.colors.textColor,
    '>svg': {
      fontSize: '20px',
      marginRight: '12px',
    },
  };
});
export const StyledQuickSearchTipButton = styled('div')(({ theme }) => {
  return {
    ...displayFlex('center', 'center'),
    marginTop: '12px',
    color: '#FFFFFF',
    width: '60px',
    height: ' 26px',
    fontSize: theme.font.sm,
    lineHeight: '22px',
    background: theme.colors.primaryColor,
    borderRadius: '8px',
    textAlign: 'center',
    cursor: 'pointer',
  };
});
export const StyledQuickSearchTipContent = styled('div')(() => {
  return {
    ...displayFlex('center', 'flex-end'),
    flexDirection: 'column',
  };
});
