import { cssVar } from '@toeverything/theme';
import { keyframes, style } from '@vanilla-extract/css';

import {
  cardBorderColor,
  cardColor,
  cardForeground,
  iconColor,
} from '../desktop/styles.css';

const expandIn = keyframes({
  from: {
    maxWidth: 44,
  },
  to: {
    maxWidth: '100vw',
  },
});
export const sonner = style({
  vars: {
    '--mobile-offset-left': '0px !important',
    '--mobile-offset-right': '0px !important',
  },
});

export const toastRoot = style({
  width: 'fit-content',
  minHeight: 44,
  borderRadius: 22,
  margin: '0px auto',
  padding: 10,
  backgroundColor: cardColor,
  color: cardForeground,
  border: `1px solid ${cardBorderColor}`,
  boxShadow: cssVar('shadow1'),

  display: 'flex',
  gap: 8,
  alignItems: 'center',

  overflow: 'hidden',
  transition: 'transform 0.1s',

  ':active': {
    transform: 'scale(0.97)',
  },

  selectors: {
    '&[data-animated="true"]': {
      // sooner will apply the animation when leaving, hide it
      visibility: 'hidden',
    },
    '&[data-animated="false"]': {
      maxWidth: 44,
      animation: `${expandIn} 0.8s cubic-bezier(.27,.28,.13,.99)`,
      animationFillMode: 'forwards',
    },
  },
});

export const toastIcon = style({
  fontSize: 24,
  lineHeight: 0,
  color: iconColor,
});

export const toastLabel = style({
  fontSize: 17,
  fontWeight: 400,
  lineHeight: '22px',
  letterSpacing: -0.43,
  whiteSpace: 'nowrap',
});

export const detailRoot = style({
  position: 'fixed',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  display: 'flex',
  alignItems: 'start',
  padding: 16,
  zIndex: 9999,
  background: 'rgba(0,0,0,0.1)',
});
export const detailCard = style({
  // backgroundColor: cardColor,
  // color: cardForeground,
});
export const detailHeader = style({
  padding: '0 20px',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
});
export const detailContent = style({
  padding: '0 20px',
  marginTop: 8,
});
export const detailIcon = style([toastIcon, {}]);
export const detailLabel = style([
  toastLabel,
  {
    width: 0,
    flex: 1,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
]);
export const detailActions = style({
  display: 'flex',
  flexDirection: 'column',
});
