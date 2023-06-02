import type { CSSProperties } from 'react';

import { displayFlex, styled } from '../../styles';

export const StyledEmptyContainer = styled('div')<{ style?: CSSProperties }>(
  ({ style }) => {
    return {
      height: '100%',
      ...displayFlex('center', 'center'),
      flexDirection: 'column',
      color: 'var(--affine-text-secondary-color)',
      svg: {
        color: 'transparent',
        width: style?.width ?? '248px',
        height: style?.height ?? '216px',
        fontSize: style?.fontSize ?? 'inherit',
      },
    };
  }
);
