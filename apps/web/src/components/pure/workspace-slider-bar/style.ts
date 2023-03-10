import { displayFlex, styled, textEllipsis } from '@affine/component';
import Link from 'next/link';

export const StyledSliderBar = styled('div')<{ show: boolean }>(
  ({ theme, show }) => {
    return {
      width: show ? '256px' : '0',
      whiteSpace: 'nowrap',
      height: '100vh',
      minHeight: '450px',
      background: theme.colors.hubBackground,
      boxShadow: theme.shadow.popover,
      transition: 'width .15s, padding .15s',
      position: 'relative',
      zIndex: theme.zIndex.modal,
      padding: show ? '0 12px' : '0',
      flexShrink: 0,
    };
  }
);
export const StyledSidebarWrapper = styled('div')(() => {
  return {
    position: 'absolute',
    right: '12px',
    top: '16px',
    zIndex: 1,
  };
});
export const StyledSliderBarWrapper = styled('div')(() => {
  return {
    height: '100%',
    overflowX: 'hidden',
    overflowY: 'auto',
    position: 'relative',
  };
});

export const StyledListItem = styled('div')<{
  active?: boolean;
  disabled?: boolean;
}>(({ theme, active, disabled }) => {
  return {
    height: '32px',
    marginTop: '12px',
    color: active ? theme.colors.primaryColor : theme.colors.textColor,
    paddingLeft: '12px',
    borderRadius: '5px',
    cursor: 'pointer',
    ...displayFlex('flex-start', 'center'),
    ...(disabled
      ? {
          cursor: 'not-allowed',
          color: theme.colors.borderColor,
        }
      : {}),

    '>svg': {
      fontSize: '20px',
      marginRight: '12px',
    },
    ':hover:not([disabled])': {
      color: theme.colors.primaryColor,
      backgroundColor: theme.colors.hoverBackground,
    },
  };
});

export const StyledLink = styled(Link)(() => {
  return {
    flexGrow: 1,
    textAlign: 'left',
    color: 'inherit',
    ...displayFlex('flex-start', 'center'),
    ':visited': {
      color: 'inherit',
    },
    '>svg': {
      fontSize: '20px',
      marginRight: '12px',
    },
  };
});
export const StyledNewPageButton = styled(StyledListItem)(() => {
  return {
    position: 'absolute',
    bottom: '24px',
    left: '0',
    right: '0',
    margin: 'auto',
    ':hover': {
      cursor: 'pointer',
    },
  };
});

export const StyledSubListItem = styled('button')<{
  disable?: boolean;
  active?: boolean;
}>(({ theme, disable, active }) => {
  return {
    width: '100%',
    height: '32px',
    marginTop: '4px',
    color: disable
      ? theme.colors.disableColor
      : active
      ? theme.colors.primaryColor
      : theme.colors.textColor,
    backgroundColor: active ? theme.colors.hoverBackground : 'unset',

    cursor: disable ? 'not-allowed' : 'pointer',
    paddingLeft: '45px',
    lineHeight: '32px',
    textAlign: 'start',
    ...textEllipsis(1),
    ':hover': disable
      ? {}
      : {
          color: theme.colors.primaryColor,
          backgroundColor: theme.colors.hoverBackground,
        },
  };
});
