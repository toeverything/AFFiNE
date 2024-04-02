import { cssVar } from '@toeverything/theme';
import { createVar, globalStyle, style } from '@vanilla-extract/css';

export const cardColor = createVar();
export const cardForeground = createVar();
export const cardBorderColor = createVar();
export const actionTextColor = createVar();

export const card = style({
  borderRadius: 8,
  borderWidth: 1,
  borderStyle: 'solid',
  padding: 16,
  boxShadow: cssVar('shadow1'),
  backgroundColor: cardColor,
  borderColor: cardBorderColor,
  color: cardForeground,
});

export const header = style({
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
});
export const headAlignWrapper = style({
  height: 24,
  display: 'flex',
  alignItems: 'center',
});
export const icon = style({
  width: 24,
  display: 'flex',
  placeItems: 'center',
  marginRight: 10,
});
globalStyle(`${icon} svg`, {
  width: '100%',
  height: '100%',
});
export const title = style({
  width: 0,
  flexGrow: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontWeight: 400,
  lineHeight: '24px',
  fontSize: 15,
  marginRight: 10,
});
export const action = style({
  marginRight: 16,
});
export const actionButton = style({
  color: actionTextColor,
  position: 'relative',
  background: 'transparent',
  border: 'none',
  '::before': {
    content: '""',
    position: 'absolute',
    inset: 0,
    borderRadius: 'inherit',
    backgroundColor: cssVar('black'),
    opacity: 0.04,
  },
  ':hover': {
    boxShadow: 'none !important',
  },
});
export const closeIcon = style({
  color: `${cardForeground} !important`,
});

export const main = style({
  marginTop: 5,
  fontSize: 14,
  lineHeight: '22px',

  selectors: {
    '[data-with-icon] &': {
      paddingLeft: 34,
    },
  },
});
