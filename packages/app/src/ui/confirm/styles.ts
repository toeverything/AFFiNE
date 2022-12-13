import { displayFlex, styled } from '@/styles';
import { ModalWrapper } from '@/ui/modal';

export const StyledModalWrapper = styled(ModalWrapper)(({ theme }) => {
  return {
    width: '460px',
    height: '240px',
    padding: '0 60px',
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
