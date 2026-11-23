import { css } from '@emotion/css';
import { cssVarV2 } from '@toeverything/theme/v2';

export const dataViewVars = {
  cellTextSize: '--affine-data-view-cell-text-size',
  cellTextLineHeight: '--affine-data-view-cell-text-line-height',
};

export const dataViewRoot = css({
  fontFamily: 'var(--affine-font-family)',
  [dataViewVars.cellTextSize]: '14px',
  [dataViewVars.cellTextLineHeight]: '22px',
});

export const withDataViewCssVariable = css({
  fontFamily: 'var(--affine-font-family)',
  [dataViewVars.cellTextSize]: '14px',
  [dataViewVars.cellTextLineHeight]: '22px',
});

export const p2 = css({
  padding: '2px',
});
export const p4 = css({
  padding: '4px',
});
export const p8 = css({
  padding: '8px',
});

export const hover = css({
  '&:hover, &.active': {
    backgroundColor: 'var(--affine-hover-color)',
    cursor: 'pointer',
  },
});

export const icon16 = css({
  fontSize: '16px',
  color: cssVarV2.icon.primary,
});
export const icon20 = css({
  fontSize: '20px',
  color: cssVarV2.icon.primary,
});

export const border = css({
  border: `1px solid ${cssVarV2.layer.insideBorder.border}`,
});
export const round4 = css({
  borderRadius: '4px',
});
export const round8 = css({
  borderRadius: '8px',
});
export const color2 = css({
  color: 'var(--affine-text-secondary-color)',
});
export const shadow2 = css({
  boxShadow: 'var(--affine-shadow-2)',
});

export const dividerH = css({
  height: '1px',
  backgroundColor: 'var(--affine-divider-color)',
  margin: '8px 0',
});
export const dividerV = css({
  width: '1px',
  backgroundColor: 'var(--affine-divider-color)',
  margin: '0 8px',
});

export const dv = {
  p2,
  p4,
  p8,
  hover,
  icon16,
  icon20,
  border,
  round4,
  round8,
  color2,
  shadow2,
  dividerH,
  dividerV,
};
