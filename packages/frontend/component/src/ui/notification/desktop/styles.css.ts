import { cssVar } from '@toeverything/theme';
import { createVar, globalStyle, style } from '@vanilla-extract/css';

export const cardColor = createVar();
export const cardForeground = createVar();
export const cardBorderColor = createVar();
export const actionTextColor = createVar();
export const iconColor = createVar();
export const closeIconColor = createVar();

export const cardWrapper = style({});

export const card = style({
  borderRadius: 8,
  boxShadow: cssVar('shadow1'),
  borderWidth: 1,
  borderStyle: 'solid',
  backgroundColor: cardColor,
  borderColor: cardBorderColor,
  color: cardForeground,
});
export const cardInner = style({
  padding: 16,
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
  color: iconColor,
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

export const actionButton = style({
  color: actionTextColor,
  position: 'relative',
  background: 'transparent',
  border: 'none',
  fontSize: cssVar('fontSm'),
  lineHeight: '22px',
});
export const closeButton = style({
  selectors: {
    '&[data-float="true"]': {
      position: 'absolute',
      top: 16,
      right: 16,
    },
  },
});
export const closeIcon = style({
  color: `${closeIconColor} !important`,
});

export const main = style({
  marginTop: 5,
  fontSize: cssVar('fontSm'),
  lineHeight: '22px',

  selectors: {
    '[data-with-icon] &[data-align="title"]': {
      paddingLeft: 34,
    },
  },
});
