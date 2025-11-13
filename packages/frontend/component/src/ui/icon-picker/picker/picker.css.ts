import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const root = style({
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
});

// search

export const searchContainer = style({
  padding: '16px 12px 8px 12px',
  display: 'flex',
  gap: 8,
});

export const searchInput = style({
  width: 0,
  flexGrow: 1,
  height: `32px !important`,
  borderRadius: `4px !important`,
  gap: `0px !important`,
});

// content scroll
export const scrollRoot = style({
  height: 0,
  flexGrow: 1,
});
export const emojiScrollRoot = style([
  scrollRoot,
  {
    paddingTop: '8px',
  },
]);
export const iconScrollRoot = style([
  scrollRoot,
  {
    padding: '0px 12px',
  },
]);

export const scrollViewport = style({
  padding: '8px 0px',
});

// group
export const group = style({
  selectors: {
    '&:not(:last-child)': {
      marginBottom: 8,
    },
  },
});

export const groupName = style({
  fontSize: 12,
  fontWeight: 500,
  lineHeight: '18px',
  color: cssVarV2.text.secondary,
  height: 30,
  display: 'flex',
  alignItems: 'center',
  padding: '0px 4px',
  backgroundColor: cssVarV2.layer.background.overlayPanel,
});

export const groupGrid = style({
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'space-between',
  gap: 4,

  // fill the last row with empty space
  '::after': {
    content: '""',
    flex: 'auto',
    minWidth: '24px',
  },
});
