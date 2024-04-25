import { createVar, style } from '@vanilla-extract/css';

import { displayFlex } from '../../styles';

export const svgWidth = createVar();
export const svgHeight = createVar();
export const svgFontSize = createVar();

export const emptyContainer = style({
  height: '100%',
  ...displayFlex('center', 'center'),
  flexDirection: 'column',
  color: 'var(--affine-text-secondary-color)',
});
export const emptySvg = style({
  vars: {
    [svgWidth]: '248px',
    [svgHeight]: '216px',
    [svgFontSize]: 'inherit',
  },
  width: svgWidth,
  height: svgHeight,
  fontSize: svgFontSize,
});
