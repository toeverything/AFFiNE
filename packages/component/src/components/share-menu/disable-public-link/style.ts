import { styled } from '../../..';

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
