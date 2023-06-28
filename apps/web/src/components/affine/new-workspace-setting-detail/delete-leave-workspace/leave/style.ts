import { styled } from '@affine/component';

export const StyledModalWrapper = styled('div')(() => {
  return {
    position: 'relative',
    padding: '0px',
    width: '460px',
    background: 'var(--affine-white)',
    borderRadius: '12px',
  };
});

export const StyledModalHeader = styled('div')(() => {
  return {
    margin: '44px 0px 12px 0px',
    width: '460px',
    fontWeight: '600',
    fontSize: '20px;',
    textAlign: 'center',
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

export const StyledButtonContent = styled('div')(() => {
  return {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'center',
    margin: '0px 0 32px 0',
  };
});
