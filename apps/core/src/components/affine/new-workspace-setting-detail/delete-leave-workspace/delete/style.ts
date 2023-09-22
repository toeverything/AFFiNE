import { styled } from '@affine/component';

export const StyledModalWrapper = styled('div')(() => {
  return {
    position: 'relative',
    padding: '0px',
    width: '560px',
    background: 'var(--affine-background-overlay-panel-color)',
    borderRadius: '12px',
    // height: '312px',
  };
});

export const StyledModalHeader = styled('div')(() => {
  return {
    margin: '44px 0px 12px 0px',
    width: '560px',
    fontWeight: '600',
    fontSize: '20px;',
    textAlign: 'center',
  };
});

export const StyledInputContent = styled('div')(() => {
  return {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'center',
    margin: '24px 0',
    fontSize: 'var(--affine-font-base)',
  };
});

export const StyledWorkspaceName = styled('span')(() => {
  return {
    fontWeight: '600',
  };
});
