import { css } from '@emotion/css';
import { cssVarV2 } from '@toeverything/theme/v2';

export const leftBar = css({
  display: 'flex',
  height: '34px',
});

export const dragHandlerWrapper = css({
  backgroundColor: cssVarV2.layer.background.primary,
  marginBottom: '1px',
  display: 'flex',
});

export const dragHandler = css({
  width: '4px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'grab',
  backgroundColor: 'var(--affine-background-primary-color)',
  opacity: 0,
});

export const checkboxWrapper = css({
  backgroundColor: cssVarV2.layer.background.primary,
  marginBottom: '1px',
  display: 'flex',
});

export const rowSelectedBg = css({
  backgroundColor: 'var(--affine-primary-color-04)',
});

export const dragHandlerIndicator = css({
  width: '4px',
  borderRadius: '2px',
  height: '12px',
  backgroundColor: 'var(--affine-placeholder-color)',
});

export const show = css({
  opacity: '1 !important',
});
export const rowSelectCheckbox = css({
  display: 'flex',
  alignItems: 'center',
  opacity: 0,
  cursor: 'pointer',
  fontSize: '20px',
  color: cssVarV2.icon.primary,
});
