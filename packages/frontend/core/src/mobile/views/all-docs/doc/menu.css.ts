import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const root = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
});
export const head = style({
  padding: '10px 20px',
  fontSize: 17,
  fontWeight: 600,
  lineHeight: '22px',
  letterSpacing: -0.43,
  color: cssVarV2('text/primary'),
});

export const item = style({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 4,
  height: 34,
  padding: '0 20px',

  fontSize: 17,
  lineHeight: '22px',
  fontWeight: 400,
  letterSpacing: -0.43,
});
export const itemSuffix = style({
  display: 'flex',
  gap: 8,
  alignItems: 'center',
});
export const itemSuffixText = style({
  color: cssVarV2('text/secondary'),
});
export const itemSuffixIcon = style({
  color: cssVarV2('icon/primary'),
  fontSize: 20,
});
export const divider = style({
  width: '100%',
  height: 16,
  display: 'flex',
  alignItems: 'center',
  ':before': {
    content: "''",
    height: 0.5,
    width: '100%',
    backgroundColor: cssVarV2('layer/insideBorder/border'),
  },
});
export const propertiesList = style({
  padding: '4px 20px',
  display: 'flex',
  gap: 8,
});
export const propertyButton = style({
  opacity: 0.4,
  selectors: {
    '&[data-selected="true"]': {
      opacity: 1,
    },
  },
});
