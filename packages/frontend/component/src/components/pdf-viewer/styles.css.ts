import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const titlebar = style({
  display: 'flex',
  justifyContent: 'space-between',
  width: '100%',
  height: '52px',
  padding: '10px 0 10px 8px',
  background: cssVarV2('layer/background/primary'),
  fontSize: '12px',
  fontWeight: 400,
  color: cssVarV2('text/secondary'),
  borderTopWidth: '0.5px',
  borderTopStyle: 'solid',
  borderTopColor: cssVarV2('layer/insideBorder/border'),
});

export const titlebarChild = style({
  selectors: {
    [`${titlebar} > &`]: {
      display: 'flex',
      gap: '12px',
      alignItems: 'center',
      paddingLeft: '12px',
      paddingRight: '12px',
    },
  },
});

export const titlebarName = style({
  display: 'flex',
});
