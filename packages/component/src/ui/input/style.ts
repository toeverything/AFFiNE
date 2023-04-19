import type { CSSProperties } from 'react';

import { styled } from '../../styles';

export const StyledInput = styled('input')<{
  disabled?: boolean;
  value?: string;
  width?: CSSProperties['width'];
  height?: CSSProperties['height'];
  noBorder?: boolean;
}>(({ theme, width, disabled, height, noBorder }) => {
  return {
    width: width || '100%',
    height,
    lineHeight: '22px',
    padding: '8px 12px',
    color: disabled
      ? 'var(--affine-text-disable-color)'
      : 'var(--affine-text-primary-color)',
    border: noBorder ? 'unset' : `1px solid`,
    borderColor: 'var(--affine-border-color)', // TODO: check out disableColor,
    backgroundColor: 'var(--affine-white)',
    borderRadius: '10px',
    '&::placeholder': {
      color: 'var(--affine-placeholder-color)',
    },
    '&:focus': {
      borderColor: 'var(--affine-primary-color)',
    },
  };
});
