import { styled } from '@/styles';

export const StyledFAQ = styled('div')(({ theme }) => {
  return {
    width: '32px',
    height: '32px',
    color: theme.colors.iconColor,
    position: 'fixed',
    right: '30px',
    bottom: '30px',
    borderRadius: '50%',
    zIndex: theme.zIndex.popover,
  };
});
export const StyledTransformIcon = styled.div<{ in: boolean }>(
  ({ in: isIn, theme }) => ({
    height: '32px',
    width: '32px',
    borderRadius: '50%',
    position: 'absolute',
    left: '0',
    right: '0',
    bottom: '0',
    top: '0',
    margin: 'auto',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    opacity: isIn ? 1 : 0,
    backgroundColor: isIn
      ? theme.colors.hoverBackground
      : theme.colors.pageBackground,
  })
);
export const StyledIconWrapper = styled('div')<{ isEdgelessDark: boolean }>(
  ({ theme, isEdgelessDark }) => {
    return {
      color: isEdgelessDark
        ? theme.colors.popoverBackground
        : theme.colors.iconColor,
      marginBottom: '24px',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      cursor: 'pointer',
      backgroundColor: isEdgelessDark
        ? 'transparent'
        : theme.colors.pageBackground,
      borderRadius: '50%',
      width: '32px',
      height: '32px',
      transition: 'background-color 0.3s',
      position: 'relative',
      ':hover': {
        color: isEdgelessDark
          ? theme.colors.iconColor
          : theme.colors.primaryColor,
        backgroundColor: theme.colors.hoverBackground,
      },
    };
  }
);

export const StyledFAQWrapper = styled('div')(({ theme }) => {
  return {
    position: 'absolute',
    bottom: '100%',
    left: '0',
    width: '100%',
    color: theme.colors.iconColor,
    ':hover': {
      color: theme.colors.popoverColor,
    },
  };
});
