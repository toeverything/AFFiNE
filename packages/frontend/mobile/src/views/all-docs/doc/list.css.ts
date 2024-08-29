import { cssVarV2 } from '@toeverything/theme/v2';
import { globalStyle, style } from '@vanilla-extract/css';

export const groupTitle = style({
  display: 'flex',
  alignItems: 'center',
  padding: '0px 16px',
  width: '100%',
});
// to override style defined in `core`
globalStyle(`${groupTitle} > div`, {
  marginRight: -4,
});
globalStyle(`${groupTitle} div[data-testid^='group-label']`, {
  fontSize: `20px !important`,
  color: `${cssVarV2('text/primary')} !important`,
  lineHeight: '25px !important',
});
export const groupTitleIcon = style({
  color: cssVarV2('icon/tertiary'),
  transition: 'transform 0.2s',
  selectors: {
    '[data-state="closed"] &': {
      transform: `rotate(-90deg)`,
    },
  },
});
export const groups = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 32,
});
