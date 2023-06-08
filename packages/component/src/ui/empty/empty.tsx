import type { CSSProperties, ReactNode } from 'react';

import { EmptySvg } from './empty-svg';
import { StyledEmptyContainer } from './style';
export type EmptyContentProps = {
  containerStyle?: CSSProperties;
  title?: ReactNode;
  description?: ReactNode;
  descriptionStyle?: CSSProperties;
};

export const Empty = ({
  containerStyle,
  title,
  description,
  descriptionStyle,
}: EmptyContentProps) => {
  return (
    <StyledEmptyContainer style={containerStyle}>
      <div style={{ color: 'var(--affine-black)' }}>
        <EmptySvg />
      </div>
      {title && (
        <p
          style={{
            marginTop: '30px',
            color: 'var(--affine-text-primary-color)',
            fontWeight: 700,
          }}
        >
          {title}
        </p>
      )}
      {description && (
        <p style={{ marginTop: title ? '8px' : '30px', ...descriptionStyle }}>
          {description}
        </p>
      )}
    </StyledEmptyContainer>
  );
};

export default Empty;
