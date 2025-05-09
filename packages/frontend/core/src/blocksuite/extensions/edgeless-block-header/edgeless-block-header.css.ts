import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

const headerPadding = 8;
export const header = style({
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: headerPadding,
  zIndex: 2, // should have higher z-index than the note mask
  pointerEvents: 'none',
});

export const titleContainer = style({
  display: 'flex',
  alignItems: 'center',
  padding: 4,
  marginRight: 8,
  gap: 4,
  flex: 1,
  overflow: 'hidden',
  whiteSpace: 'nowrap',
});

export const titleIcon = style({
  display: 'flex',
  alignItems: 'center',
  color: cssVarV2('icon/primary'),
});

const title = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  fontFamily: 'Inter',
});

export const noteTitle = style([
  title,
  {
    color: cssVarV2('text/primary'),
    fontWeight: 600,
    lineHeight: '30px',
  },
]);

export const embedSyncedDocTitle = style([
  title,
  {
    color: cssVarV2('text/secondary'),
    fontWeight: 400,
    lineHeight: '24px',
    fontSize: '15px',
    selectors: {
      '&[data-collapsed="true"]': {
        color: cssVarV2('text/primary'),
        fontWeight: 500,
      },
    },
  },
]);

export const iconSize = 24;
const buttonPadding = 4;
export const button = style({
  padding: buttonPadding,
  pointerEvents: 'auto',
  color: cssVarV2('icon/transparentBlack'),
  borderRadius: 4,
  gap: 0,
});

export const buttonText = style([
  embedSyncedDocTitle,
  {
    fontWeight: 500,
  },
]);

export const headerHeight = 2 * headerPadding + iconSize + 2 * buttonPadding;
