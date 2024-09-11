import { assignInlineVars } from '@vanilla-extract/dynamic';
import type { CSSProperties, ReactNode } from 'react';

import { EmptySvg } from './empty-svg';
import * as styles from './index.css';

type ContainerStyleProps = {
  width?: string;
  height?: string;
  fontSize?: string;
};
export type EmptyContentProps = {
  containerStyle?: ContainerStyleProps;
  title?: ReactNode;
  description?: ReactNode;
  descriptionStyle?: CSSProperties;
};

/**
 * @deprecated use different empty components for different use cases, like `EmptyDocs` for documentation empty state
 */
export const Empty = ({
  containerStyle,
  title,
  description,
  descriptionStyle,
}: EmptyContentProps) => {
  const cssVar = assignInlineVars({
    [styles.svgWidth]: containerStyle?.width,
    [styles.svgHeight]: containerStyle?.height,
    [styles.svgFontSize]: containerStyle?.fontSize,
  });
  return (
    <div className={styles.emptyContainer}>
      <div style={{ color: 'var(--affine-black)' }}>
        <EmptySvg className={styles.emptySvg} style={cssVar} />
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
    </div>
  );
};

export default Empty;
