import { displayFlex, styled, textEllipsis } from '@/styles';

export const StyledSliderBar = styled.div<{ show: boolean }>(
  ({ theme, show }) => {
    return {
      width: show ? '320px' : '0',
      height: '100vh',
      background: '#FBFBFC',
      boxShadow: theme.shadow.modal,
      transition: 'width .15s',
      position: 'relative',
      zIndex: theme.zIndex.modal,
      padding: show ? '24px 12px' : '24px 0',
      overflowX: 'hidden',
    };
  }
);
export const StyledWrapper = styled.div(() => {
  return {
    // padding: '24px 12px',
    // height: '100%',
    // overflowY: 'auto',
  };
});
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

export const StyledListItem = styled.button(({ theme }) => {
  return {
    width: '296px',
    height: '32px',
    marginTop: '12px',
    fontSize: theme.font.sm,
    color: theme.colors.popoverColor,
    ...displayFlex('flex-start', 'center'),
    ':hover': {
      color: theme.colors.primaryColor,
      backgroundColor: theme.colors.hoverBackground,
    },
  };
});

export const StyledSubListItem = styled.button(({ theme }) => {
  return {
    width: '296px',
    height: '32px',
    marginTop: '4px',
    fontSize: theme.font.sm,
    fontWeight: 400,
    color: theme.colors.popoverColor,
    paddingLeft: '45px',
    lineHeight: '32px',
    textAlign: 'start',
    ...textEllipsis(1),
    ':hover': {
      color: theme.colors.primaryColor,
      backgroundColor: theme.colors.hoverBackground,
      fontWeight: 500,
    },
  };
});
