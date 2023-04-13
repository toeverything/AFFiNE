import { displayFlex, styled, textEllipsis } from '@affine/component';

export const StyledNavigationPathContainer = styled('div')(({ theme }) => {
  return {
    height: '46px',
    ...displayFlex('flex-start', 'center'),
    background: theme.colors.hubBackground,
    padding: '0 40px 0 20px',
    position: 'relative',
    fontSize: theme.font.sm,
    zIndex: 2,
    '.collapse-btn': {
      position: 'absolute',
      right: '12px',
      top: 0,
      bottom: 0,
      margin: 'auto',
    },
    '.path-arrow': {
      fontSize: '16px',
      color: theme.colors.iconColor,
    },
  };
});

export const StyledNavPathLink = styled('div')<{ active?: boolean }>(
  ({ theme, active }) => {
    return {
      color: active ? theme.colors.textColor : theme.colors.secondaryTextColor,
      cursor: active ? 'auto' : 'pointer',
      maxWidth: '160px',
      ...textEllipsis(1),
      padding: '0 4px',
      transition: 'background .15s',
      ':hover': active
        ? {}
        : {
            background: theme.colors.hoverBackground,
            borderRadius: '4px',
          },
    };
  }
);

export const StyledNavPathExtendContainer = styled('div')<{ show: boolean }>(
  ({ show, theme }) => {
    return {
      position: 'absolute',
      left: '0',
      top: show ? '0' : '-100%',
      zIndex: '1',
      height: '100%',
      width: '100%',
      background: theme.colors.hubBackground,
      transition: 'top .15s',
      fontSize: theme.font.sm,
      color: theme.colors.secondaryTextColor,
      paddingTop: '46px',
      paddingRight: '12px',

      '.tree-container': {
        padding: '0 12px 0 15px',
      },
    };
  }
);
