import type { CSSProperties } from 'react';

import { displayFlex, styled } from '../../styles';

export const StyledEmptyContainer = styled('div')<{ style?: CSSProperties }>(
  ({ style }) => {
    return {
      height: '100%',
      ...displayFlex('center', 'center'),
      flexDirection: 'column',
      svg: {
        width: style?.width ?? '320px',
        height: style?.height ?? '280px',
        fontSize: style?.fontSize ?? 'inherit',
      },
    };
  }
);
