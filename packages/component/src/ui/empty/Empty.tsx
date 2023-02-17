import { CSSProperties } from 'react';

import { styled } from '../../styles';
import { EmptySVG } from './EmptySVG';

export type EmptyContentProps = {
  width?: CSSProperties['width'];
  height?: CSSProperties['height'];
  fontSize?: CSSProperties['fontSize'];
};
export const Empty = styled(EmptySVG)<EmptyContentProps>(
  ({ fontSize, width, height }) => {
    return {
      width,
      height,
      fontSize,
    };
  }
);

export default Empty;
