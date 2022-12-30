import { displayFlex, styled } from '@/styles';
import { ModalWrapper } from '@/ui/modal';

export const StyledModalWrapper = styled(ModalWrapper)(() => {
  return {
    width: '460px',
    padding: '46px 60px 32px',
  };
});

export const StyledConfirmTitle = styled.div(({ theme }) => {
  return {
    fontSize: theme.font.h6,
    fontWeight: 600,
    textAlign: 'center',
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
