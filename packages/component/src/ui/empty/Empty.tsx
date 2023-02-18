import { CSSProperties } from 'react';

import { EmptySVG } from './EmptySVG';
import { StyledEmptyContainer } from './style';
export type EmptyContentProps = {
  imageStyle?: CSSProperties;
  description?: string;
  descriptionStyle?: CSSProperties;
};

export const Empty = ({
  imageStyle,
  description,
  descriptionStyle,
}: EmptyContentProps) => {
  return (
    <StyledEmptyContainer style={imageStyle}>
      <EmptySVG className="empty-img" />
      <p style={descriptionStyle}>{description}</p>
    </StyledEmptyContainer>
  );
};

export default Empty;
