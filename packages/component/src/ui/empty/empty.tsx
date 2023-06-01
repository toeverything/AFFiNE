import { useTheme } from 'next-themes';
import type { CSSProperties } from 'react';

import { EmptyDarkSvg, EmptyLightSvg } from './empty-svg';
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
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  return (
    <StyledEmptyContainer style={containerStyle}>
      {isDark ? <EmptyDarkSvg /> : <EmptyLightSvg />}
      <p style={{ marginTop: '30px', ...descriptionStyle }}>{description}</p>
    </StyledEmptyContainer>
  );
};

export default Empty;
