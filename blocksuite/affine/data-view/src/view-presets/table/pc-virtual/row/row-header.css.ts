import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const leftBar = style({
  display: 'flex',
  height: '34px',
});

export const dragHandlerWrapper = style({
  backgroundColor: cssVarV2.layer.background.primary,
  marginBottom: '1px',
  display: 'flex',
});

export const dragHandler = style({
  width: '4px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'grab',
  backgroundColor: 'var(--affine-background-primary-color)',
  opacity: 0,
});

export const checkboxWrapper = style({
  backgroundColor: cssVarV2.layer.background.primary,
  marginBottom: '1px',
  display: 'flex',
});

export const rowSelectedBg = style({
  backgroundColor: 'var(--affine-primary-color-04)',
});

export const dragHandlerIndicator = style({
  width: '4px',
  borderRadius: '2px',
  height: '12px',
  backgroundColor: 'var(--affine-placeholder-color)',
});

export const rowSelectCheckbox = style({
  display: 'flex',
  alignItems: 'center',
  opacity: 0,
  cursor: 'pointer',
  fontSize: '20px',
  color: cssVarV2.icon.primary,
});

export const show = style({
  opacity: 1,
});
