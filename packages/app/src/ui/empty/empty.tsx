import React, { CSSProperties } from 'react';
import { EmptySVG } from './emptySVG';
import { styled } from '@/styles';

export type ContentProps = {
  width?: CSSProperties['width'];
  height?: CSSProperties['height'];
  fontSize?: CSSProperties['fontSize'];
};
export const Empty = styled(EmptySVG)<ContentProps>(
  ({ theme, fontSize, width, height }) => {
    return {
      width,
      height,
      fontSize,
    };
  }
);

export default Empty;
