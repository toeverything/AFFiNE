import React, { CSSProperties } from 'react';
import { styled, textEllipsis } from '@/styles';

// This component should be just used to be contained the text content
export type ContentProps = {
  width?: CSSProperties['width'];
  maxWidth?: CSSProperties['maxWidth'];
  color?: CSSProperties['color'];
  fontSize?: CSSProperties['fontSize'];
  fontWeight?: CSSProperties['fontWeight'];
  lineHeight?: CSSProperties['lineHeight'];
  ellipsis?: boolean;
  lineNum?: number;
  children: string;
};

export const Content = styled.div<ContentProps>(
  ({
    theme,
    color,
    fontSize,
    fontWeight,
    lineHeight,
    ellipsis,
    lineNum,
    width,
    maxWidth,
  }) => {
    return {
      width,
      maxWidth,
      display: 'inline-block',
      color: color ?? theme.colors.textColor,
      fontSize: fontSize ?? theme.font.base,
      fontWeight: fontWeight ?? 400,
      lineHeight: lineHeight ?? 1.5,
      ...(ellipsis ? textEllipsis(lineNum) : {}),
    };
  }
);

export default Content;
