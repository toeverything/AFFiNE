import { CSSProperties } from 'react';
import { styled, textEllipsis } from '../../styles';

// This component should be just used to be contained the text content
export type ContentProps = {
  width?: CSSProperties['width'];
  maxWidth?: CSSProperties['maxWidth'];
  align?: CSSProperties['textAlign'];
  color?: CSSProperties['color'];
  fontSize?: CSSProperties['fontSize'];
  weight?: CSSProperties['fontWeight'];
  lineHeight?: CSSProperties['lineHeight'];
  ellipsis?: boolean;
  lineNum?: number;
  children: string;
};
export const Content = styled('div', {
  shouldForwardProp: prop => {
    return ![
      'color',
      'fontSize',
      'weight',
      'lineHeight',
      'ellipsis',
      'lineNum',
      'width',
      'maxWidth',
      'align',
    ].includes(prop);
  },
})<ContentProps>(
  ({
    theme,
    color,
    fontSize,
    weight,
    lineHeight,
    ellipsis,
    lineNum,
    width,
    maxWidth,
    align,
  }) => {
    return {
      width,
      maxWidth,
      textAlign: align,
      display: 'inline-block',
      color: color ?? theme.colors.textColor,
      fontSize: fontSize ?? theme.font.base,
      fontWeight: weight ?? 400,
      lineHeight: lineHeight ?? 1.5,
      ...(ellipsis ? textEllipsis(lineNum) : {}),
    };
  }
);

export default Content;
