import { CSSProperties } from 'react';
import { EmptySVG } from './EmptySVG';
import { styled } from '@/styles';

export type ContentProps = {
  width?: CSSProperties['width'];
  height?: CSSProperties['height'];
  fontSize?: CSSProperties['fontSize'];
};
export const Empty = styled(EmptySVG)<ContentProps>(
  ({ fontSize, width, height }) => {
    return {
      width,
      height,
      fontSize,
    };
  }
);

export default Empty;
