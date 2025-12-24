import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const displayMenuContainer = style({
  width: '280px',
});

export const subMenuSelectorContainer = style({
  display: 'flex',
  justifyContent: 'space-between',
});

export const subMenuSelectorSelected = style({
  color: cssVarV2('text/secondary'),
});
