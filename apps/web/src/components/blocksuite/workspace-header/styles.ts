import {
  absoluteCenter,
  displayFlex,
  styled,
  textEllipsis,
} from '@affine/component';

export const StyledHeaderContainer = styled('div')<{
  hasWarning: boolean;
}>(({ hasWarning }) => {
  return {
    height: hasWarning ? '96px' : '52px',
    flexShrink: 0,
    position: 'sticky',
    top: 0,
    background: 'var(--affine-background-primary-color)',
    zIndex: 1,
  };
});
export const StyledHeader = styled('div')<{ hasWarning: boolean }>(
  ({ theme }) => {
    return {
      flexShrink: 0,
      height: '52px',
      width: '100%',
      padding: '0 20px',
      ...displayFlex('space-between', 'center'),
      background: 'var(--affine-background-primary-color)',
      zIndex: 99,
      position: 'relative',
    };
  }
);

export const StyledTitleContainer = styled('div')(({ theme }) => ({
  width: '100%',
  height: '100%',

  margin: 'auto',
  ...absoluteCenter({ horizontal: true, position: { top: 0 } }),
  ...displayFlex('center', 'center'),
  fontSize: 'var(--affine-font-base)',
}));

export const StyledTitle = styled('div')(({ theme }) => {
  return {
    maxWidth: '620px',
    [theme.breakpoints.down('lg')]: {
      maxWidth: '480px',
    },
    [theme.breakpoints.down('md')]: {
      maxWidth: '240px',
    },
    [theme.breakpoints.down('sm')]: {
      maxWidth: '180px',
    },
    transition: 'max-width .15s',
    userSelect: 'none',
    ...textEllipsis(1),
  };
});

export const StyledTitleWrapper = styled('div')({
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
      backgroundColor: 'var(--affine-background-warning-color)',
      color: 'var(--affine-background-warning-color)',
      height: '36px',
      fontSize: 'var(--affine-font-sm)',
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
    color: 'var(--affine-icon-color)',
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
    fontSize: 'var(--affine-font-base)',
    color: 'var(--affine-text-primary-color)',
    ...displayFlex('center', 'center'),
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
    width: '48px',
    height: ' 26px',
    fontSize: 'var(--affine-font-sm)',
    lineHeight: '22px',
    background: 'var(--affine-primary-color)',
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
