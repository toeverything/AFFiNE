import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { globalStyle, style } from '@vanilla-extract/css';

export const pageItem = style({
  display: 'inline-flex',
  justifyContent: 'center',
  alignItems: 'center',
  width: '20px',
  height: '20px',
  fontSize: cssVar('fontXs'),
  color: cssVarV2('text/primary'),
  borderRadius: '4px',

  selectors: {
    '&:hover': {
      background: cssVarV2('layer/background/hoverOverlay'),
    },
    '&.active': {
      color: cssVarV2('text/emphasis'),
      cursor: 'default',
      pointerEvents: 'none',
    },
    '&.label': {
      color: cssVarV2('icon/primary'),
      fontSize: '16px',
    },
    '&.disabled': {
      opacity: '.4',
      cursor: 'default',
      color: cssVarV2('text/disable'),
      pointerEvents: 'none',
    },
  },
});

globalStyle(`${pageItem} a`, {
  width: '100%',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
});

export const pagination = style({
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  gap: '6px',
  marginTop: 5,
});
