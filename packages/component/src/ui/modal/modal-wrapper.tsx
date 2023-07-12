import type { CSSProperties } from 'react';

import { styled } from '../../styles';

export const ModalWrapper = styled('div')<{
  width?: CSSProperties['width'];
  height?: CSSProperties['height'];
  minHeight?: CSSProperties['minHeight'];
}>(({ width, height, minHeight }) => {
  return {
    width,
    height,
    minHeight,
    backgroundColor: 'var(--affine-background-secondary-color)',
    boxShadow: 'var(--affine-shadow-3)',
    borderRadius: '12px',
    position: 'relative',
    maxHeight: 'calc(100vh - 32px)',
  };
});

export default ModalWrapper;
