import { styled } from '@/styles';
import { Button } from '@/ui/button';

export const StyledModalWrapper = styled('div')(({ theme }) => {
  return {
    position: 'relative',
    padding: '0px',
    width: '460px',
    background: theme.colors.popoverBackground,
    borderRadius: '12px',
  };
});

export const StyledModalHeader = styled('div')(({ theme }) => {
  return {
    margin: '44px 0px 12px 0px',
    width: '460px',
    fontWeight: '600',
    fontSize: '20px;',
    textAlign: 'center',
    color: theme.colors.popoverColor,
  };
});

// export const StyledModalContent = styled('div')(({ theme }) => {});

export const StyledTextContent = styled('div')(() => {
  return {
    margin: 'auto',
    width: '425px',
    fontFamily: 'Avenir Next',
    fontStyle: 'normal',
    fontWeight: '400',
    fontSize: '18px',
    lineHeight: '26px',
    textAlign: 'center',
  };
});

export const StyledInputContent = styled('div')(() => {
  return {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'center',
    margin: '40px 0 24px 0',
  };
});

export const StyledButtonContent = styled('div')(() => {
  return {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'center',
    margin: '0px 0 32px 0',
  };
});

export const StyledButton = styled(Button)(() => {
  return {
    width: '260px',
    justifyContent: 'center',
  };
});
