import { cssVarV2 } from '@toeverything/theme/v2';
import { createVar, style } from '@vanilla-extract/css';

export const dataViewVars = {
  cellTextSize: createVar(),
  cellTextLineHeight: createVar(),
};

export const dataViewRoot = style({
  vars: {
    [dataViewVars.cellTextSize]: '14px',
    [dataViewVars.cellTextLineHeight]: '22px',
  },
});

export const withDataViewCssVariable = style({
  vars: {
    [dataViewVars.cellTextSize]: '14px',
    [dataViewVars.cellTextLineHeight]: '22px',
  },
  fontFamily: 'var(--affine-font-family)',
});

export const p2 = style({
  padding: '2px',
});

export const p4 = style({
  padding: '4px',
});

export const p8 = style({
  padding: '8px',
});

export const hover = style({
  selectors: {
    '&:hover, &.active': {
      backgroundColor: 'var(--affine-hover-color)',
      cursor: 'pointer',
    },
  },
});

export const icon16 = style({
  fontSize: '16px',
  color: cssVarV2.icon.primary,
});

export const icon20 = style({
  fontSize: '20px',
  color: cssVarV2.icon.primary,
});

export const border = style({
  border: `1px solid ${cssVarV2.layer.insideBorder.border}`,
});

export const round4 = style({
  borderRadius: '4px',
});

export const round8 = style({
  borderRadius: '8px',
});

export const color2 = style({
  color: 'var(--affine-text-secondary-color)',
});

export const shadow2 = style({
  boxShadow: 'var(--affine-shadow-2)',
});

export const dividerH = style({
  height: '1px',
  backgroundColor: 'var(--affine-divider-color)',
  margin: '8px 0',
});

export const dividerV = style({
  width: '1px',
  backgroundColor: 'var(--affine-divider-color)',
  margin: '0 8px',
});
