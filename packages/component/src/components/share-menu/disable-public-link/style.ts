import { styled, TextButton } from '@affine/component';

export const StyledModalWrapper = styled('div')(() => {
  return {
    position: 'relative',
    padding: '0px',
    width: '560px',
    background: 'var(--affine-white)',
    borderRadius: '12px',
    // height: '312px',
  };
});

export const StyledModalHeader = styled('div')(() => {
  return {
    margin: '44px 0px 12px 0px',
    width: '560px',
    fontWeight: '600',
    fontSize: 'var(--affine-font-h6)',
    textAlign: 'center',
  };
});

export const StyledTextContent = styled('div')(() => {
  return {
    margin: 'auto',
    width: '560px',
    padding: '0px 84px',
    fontWeight: '400',
    fontSize: 'var(--affine-font-base)',
    textAlign: 'center',
  };
});

export const StyledButtonContent = styled('div')(() => {
  return {
    margin: '32px 0',
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'center',
  };
});
export const StyledButton = styled(TextButton)(() => {
  return {
    color: 'var(--affine-primary-color)',
    height: '32px',
    background: '#F3F0FF',
    border: 'none',
    borderRadius: '8px',
    padding: '4px 20px',
  };
});
export const StyledDangerButton = styled(TextButton)(() => {
  return {
    color: '#FF631F',
    height: '32px',
    background:
      'linear-gradient(0deg, rgba(255, 99, 31, 0.1), rgba(255, 99, 31, 0.1)), #FFFFFF;',
    border: 'none',
    borderRadius: '8px',
    padding: '4px 20px',
  };
});
