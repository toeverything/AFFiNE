import { cssVarV2 } from '@toeverything/theme/v2';
import { globalStyle, style } from '@vanilla-extract/css';

import { DEFAULT_COLUMN_TITLE_HEIGHT } from '../../../../consts';

export const columnHeaderContainer = style({
  display: 'block',
  backgroundColor: 'var(--affine-background-primary-color)',
  position: 'relative',
  zIndex: 2,
});

export const columnHeader = style({
  position: 'relative',
  display: 'flex',
  flexDirection: 'row',
  borderBottom: `1px solid ${cssVarV2.layer.insideBorder.border}`,
  borderTop: `1px solid ${cssVarV2.layer.insideBorder.border}`,
  boxSizing: 'border-box',
  userSelect: 'none',
  backgroundColor: 'var(--affine-background-primary-color)',
});

export const column = style({
  cursor: 'pointer',
});

export const cell = style({
  userSelect: 'none',
});

export const columnMove = style({
  display: 'flex',
  alignItems: 'center',
  vars: {
    '--color': 'var(--affine-placeholder-color)',
    '--active': 'var(--affine-black-10)',
    '--bw': '1px',
    '--bw2': '-1px',
  },
  cursor: 'grab',
  background: 'none',
  border: 'none',
  borderRadius: 0,
  position: 'absolute',
  inset: 0,
});

globalStyle(`${columnMove} svg`, {
  width: '10px',
  height: '14px',
  color: 'var(--affine-black-10)',
  cursor: 'grab',
  opacity: 0,
});

export const headerAddColumnButton = style({
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
