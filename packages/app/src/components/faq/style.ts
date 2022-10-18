import { styled } from '@/styles';

export const StyledFAQ = styled('div')(({ theme }) => {
  return {
    width: '32px',
    height: '32px',
    backgroundColor: '#fff',
    color: theme.colors.iconColor,
    position: 'fixed',
    right: '30px',
    bottom: '30px',
    borderRadius: '50%',
    zIndex: 1000,
    ':hover': {
      backgroundColor: theme.colors.popoverBackground,
      color: theme.colors.primaryColor,
    },
  };
});

export const StyledIconWrapper = styled('div')(({ theme }) => {
  return {
    color: theme.colors.iconColor,
    marginBottom: '24px',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    cursor: 'pointer',
    backgroundColor: 'transparent',
    borderRadius: '50%',
    width: '32px',
    height: '32px',
    ':hover': {
      color: theme.colors.primaryColor,
      backgroundColor: theme.colors.hoverBackground,
    },
  };
});

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
