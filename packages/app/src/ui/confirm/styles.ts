import { displayFlex, styled, AffineTheme } from '@/styles';
import { ConfirmProps } from '@/ui/confirm/confirm';
import { ModalWrapper } from '@/ui/modal';

export const StyledModalWrapper = styled(ModalWrapper)(({ theme }) => {
  return {
    width: '460px',
    height: '240px',
    padding: '0 60px',
    background: theme.colors.popoverBackground,
    position: 'relative',
  };
});

export const StyledConfirmTitle = styled.div(({ theme }) => {
  return {
    fontSize: theme.font.h6,
    fontWeight: 600,
    textAlign: 'center',
    marginTop: '45px',
    color: theme.colors.popoverColor,
  };
});

export const StyledConfirmContent = styled.div(({ theme }) => {
  return {
    fontSize: theme.font.base,
    textAlign: 'center',
    marginTop: '12px',
    color: theme.colors.textColor,
  };
});

export const StyledButtonWrapper = styled.div(() => {
  return {
    ...displayFlex('center', 'center'),
    marginTop: '32px',
  };
});

const getButtonColors = (
  theme: AffineTheme,
  confirmType: ConfirmProps['confirmType']
) => {
  switch (confirmType) {
    case 'primary':
      return {
        background: theme.colors.primaryColor,
        color: '#fff',
        borderColor: theme.colors.primaryColor,
      };
    case 'warning':
      return {
        background: theme.colors.warningBackground,
        color: theme.colors.warningColor,
        borderColor: theme.colors.warningBackground,
        ':hover': {
          borderColor: theme.colors.warningColor,
        },
      };
    case 'danger':
      return {
        background: theme.colors.errorBackground,
        color: theme.colors.errorColor,
        borderColor: theme.colors.errorBackground,
        ':hover': {
          borderColor: theme.colors.errorColor,
        },
      };
    default:
      return {
        color: theme.colors.popoverColor,
        borderColor: theme.colors.borderColor,
        ':hover': {
          borderColor: theme.colors.primaryColor,
          color: theme.colors.primaryColor,
        },
      };
  }
};

export const StyledButton = styled.button<Pick<ConfirmProps, 'confirmType'>>(
  ({ theme, confirmType }) => {
    return {
      width: '100px',
      height: '38px',
      borderRadius: '19px',
      border: '1px solid',
      ...getButtonColors(theme, confirmType),
      fontSize: theme.font.sm,
      fontWeight: 500,

      '&:first-of-type': {
        marginRight: '24px',
      },
    };
  }
);
