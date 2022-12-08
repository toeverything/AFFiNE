import React, { CSSProperties, HTMLAttributes, PropsWithChildren } from 'react';
import { StyledContent } from '@/ui/Layout/styles';

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
export const Content = ({
  children,
  ...props
}: ContentProps & HTMLAttributes<HTMLDivElement>) => {
  return <StyledContent {...props}>{children}</StyledContent>;
};

export default Content;
