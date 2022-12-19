import { displayFlex, styled, textEllipsis } from '@/styles';
import Link from 'next/link';

export const StyledSliderBar = styled.div<{ show: boolean }>(
  ({ theme, show }) => {
    return {
      width: show ? '320px' : '0',
      height: '100vh',
      background: theme.mode === 'dark' ? '#272727' : '#FBFBFC',
      boxShadow: theme.shadow.modal,
      transition: 'width .15s',
      position: 'relative',
      zIndex: theme.zIndex.modal,
      padding: show ? '24px 12px' : '24px 0',
      overflowX: 'hidden',
      flexShrink: 0,
    };
  }
);

export const StyledArrowButton = styled.button<{ isShow: boolean }>(
  ({ theme, isShow }) => {
    return {
      width: '32px',
      height: '32px',
      ...displayFlex('center', 'center'),
      color: theme.colors.primaryColor,
      backgroundColor: theme.colors.hoverBackground,
      borderRadius: '50%',
      transition: 'all .15s',
      position: 'fixed',
      top: '34px',
      left: isShow ? '304px' : '-8px',
      zIndex: theme.zIndex.modal,
      svg: {
        transform: isShow ? 'rotate(180deg)' : 'unset',
      },
      ':hover': {
        color: '#fff',
        backgroundColor: theme.colors.primaryColor,
      },
    };
  }
);

export const StyledListItem = styled.button<{
  active?: boolean;
  disabled?: boolean;
}>(({ theme, active, disabled }) => {
  return {
    width: '296px',
    height: '32px',
    marginTop: '12px',
    fontSize: theme.font.sm,
    color: active ? theme.colors.primaryColor : theme.colors.popoverColor,
    paddingLeft: '12px',
    borderRadius: '5px',
    ...displayFlex('flex-start', 'center'),
    ...(disabled
      ? { cursor: 'not-allowed', color: theme.colors.borderColor }
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

export const StyledListItemForWorkspace = styled(StyledListItem)({
  height: '52px',
});

export const StyledLink = styled(Link)(({ theme }) => {
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
export const StyledNewPageButton = styled(StyledListItem)(({ theme }) => {
  return {
    position: 'absolute',
    bottom: '24px',
    left: '0',
    right: '0',
    margin: 'auto',
  };
});

export const StyledSubListItem = styled.button<{
  disable?: boolean;
  active?: boolean;
}>(({ theme, disable, active }) => {
  return {
    width: '296px',
    height: '32px',
    marginTop: '4px',
    fontSize: theme.font.sm,
    color: disable
      ? theme.colors.iconColor
      : active
      ? theme.colors.primaryColor
      : theme.colors.popoverColor,
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
