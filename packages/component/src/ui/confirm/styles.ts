import { displayFlex, styled } from '../../styles';
import { ModalWrapper } from '../modal';

export const StyledModalWrapper = styled(ModalWrapper)(() => {
  return {
    minWidth: '460px',
    maxWidth: '560px',
    maxHeight: '292px',
    padding: '44px 84px 32px 84px',
    overflow: 'auto',
  };
});

export const StyledConfirmTitle = styled('div')(() => {
  return {
    fontSize: 'var(--affine-font-h6)',
    fontWeight: 600,
    textAlign: 'center',
    lineHeight: '28px',
  };
});

export const StyledConfirmContent = styled('div')(() => {
  return {
    fontSize: 'var(--affine-font-base)',
    textAlign: 'center',
    marginTop: '12px',
    color: 'var(--affine-text-primary-color)',
    lineHeight: '26px',
  };
});

export const StyledColumnButtonWrapper = styled('div')(() => {
  return {
    ...displayFlex('center', 'center'),
    flexDirection: 'column',
    marginTop: '32px',
  };
});
export const StyledRowButtonWrapper = styled('div')(() => {
  return {
    ...displayFlex('center', 'center'),
    flexDirection: 'row',
    marginTop: '32px',
  };
});
