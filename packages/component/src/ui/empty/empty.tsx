import type { CSSProperties } from 'react';

import { EmptySvg } from './empty-svg';
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
      <div style={{ color: 'var(--affine-black)' }}>
        <EmptySvg />
      </div>
      <p style={{ marginTop: '30px', ...descriptionStyle }}>{description}</p>
    </StyledEmptyContainer>
  );
};

export default Empty;
