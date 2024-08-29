import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const searchHeader = style({
  padding: 16,
});

export const resTitle = style({
  padding: '6px 16px',
  marginBottom: 8,
  height: 30,

  fontSize: 13,
  lineHeight: '18px',
  fontWeight: 400,
  letterSpacing: -0.08,

  color: cssVarV2('text/secondary'),
});

export const resBlock = style({
  paddingBottom: 32,
  selectors: {
    '&[data-scroll]': {
      paddingBottom: 0,
    },
  },
});
export const resBlockTitle = style({
  padding: '0 16px',
  fontSize: 20,
  lineHeight: '25px',
  fontWeight: 400,
  letterSpacing: -0.45,
  color: cssVarV2('text/primary'),
});
const resBlockContent = style({
  padding: '12px 0px',
});
export const resBlockListContent = style([
  resBlockContent,
  {
    paddingLeft: 16,
    paddingRight: 16,
  },
]);
export const resBlockScrollContent = style([
  resBlockContent,
  {
    width: '100%',
    overflowX: 'auto',
    paddingBottom: 32,
  },
]);
export const scrollDocsContent = style({
  display: 'flex',
  gap: 12,
  padding: '0 16px',
  width: 'fit-content',
});
export const docCard = style({
  width: 170,
  height: 210,
  flexShrink: 0,
});

export const empty = style({
  padding: '0 16px',
  fontSize: 20,
  fontWeight: 400,
  lineHeight: '25px',
  letterSpacing: -0.45,
  color: cssVarV2('text/primary'),
});
