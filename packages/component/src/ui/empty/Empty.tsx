import type { CSSProperties } from 'react';

import { EmptySVG } from './EmptySVG';
import { StyledEmptyContainer } from './style';
export type EmptyContentProps = {
  containerStyle?: CSSProperties;
  description?: string;
  descriptionStyle?: CSSProperties;
};

export const Empty = ({
  containerStyle,
  description,
  descriptionStyle,
}: EmptyContentProps) => {
  return (
    <StyledEmptyContainer style={containerStyle}>
      <EmptySVG />
      <p style={descriptionStyle}>{description}</p>
    </StyledEmptyContainer>
  );
};

export default Empty;
