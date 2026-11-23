import { css } from '@emotion/css';
import { cssVarV2 } from '@toeverything/theme/v2';

import { DEFAULT_COLUMN_TITLE_HEIGHT } from '../../../../consts';

export const columnHeaderContainer = css({
  display: 'block',
  backgroundColor: 'var(--affine-background-primary-color)',
  position: 'relative',
  zIndex: 2,
});

export const columnHeader = css({
  position: 'relative',
  display: 'flex',
  flexDirection: 'row',
  borderBottom: `1px solid ${cssVarV2.layer.insideBorder.border}`,
  borderTop: `1px solid ${cssVarV2.layer.insideBorder.border}`,
  boxSizing: 'border-box',
  userSelect: 'none',
  backgroundColor: 'var(--affine-background-primary-color)',
});

export const column = css({
  cursor: 'pointer',
});

export const cell = css({
  userSelect: 'none',
});

export const headerAddColumnButton = css({
  height: `${DEFAULT_COLUMN_TITLE_HEIGHT}px`,
  backgroundColor: 'var(--affine-background-primary-color)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '40px',
  cursor: 'pointer',
  fontSize: '18px',
  color: cssVarV2.icon.primary,
});
