import React, { CSSProperties, HTMLAttributes, PropsWithChildren } from 'react';
import { styled } from '@/styles';

export const ModalWrapper = styled.div<{
  width?: CSSProperties['width'];
  height?: CSSProperties['height'];
}>(({ theme, width, height }) => {
  return {
    width,
    height,
    backgroundColor: theme.colors.popoverBackground,
    borderRadius: '12px',
    position: 'relative',
  };
});

export default ModalWrapper;
