import { cssVarV2 } from '@toeverything/theme/v2';
import { createVar, style } from '@vanilla-extract/css';

export const thumbSize = createVar();

export const root = style({
  selectors: {
    '&[data-disabled]': {
      opacity: 0.5,
    },
  },
});

export const trackStyle = style({
  width: '100%',
  height: '1px',
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  padding: '12px 0',
  cursor: 'pointer',
  selectors: {
    '&[data-disabled]': {
      cursor: 'not-allowed',
    },
  },
});
export const fakeTrackStyle = style({
  width: `calc(100% - ${thumbSize})`,
  transform: `translateX(calc(${thumbSize} * 0.5))`,
  height: '1px',
  backgroundColor: cssVarV2('layer/insideBorder/border'),
  position: 'relative',
  display: 'flex',
  justifyContent: 'space-between',
});

export const filledTrackStyle = style({
  height: '100%',
  backgroundColor: cssVarV2('icon/primary'),
  borderRadius: '1px',
  position: 'absolute',
  top: '0',
  left: '0',
});

export const thumbStyle = style({
  width: thumbSize,
  height: thumbSize,
  backgroundColor: cssVarV2('icon/primary'),
  borderRadius: '50%',
  position: 'absolute',
  top: '50%',
  transform: 'translate(-50%, -50%)',
  cursor: 'pointer',
  selectors: {
    '&[data-disabled]': {
      cursor: 'not-allowed',
    },
  },
});

export const nodeStyle = style({
  width: '8px',
  height: '8px',
  border: '2px solid transparent',
  backgroundColor: cssVarV2('layer/insideBorder/border'),
  borderRadius: '50%',
  position: 'absolute',
  top: '50%',
  cursor: 'pointer',
  transform: 'translate(-50%, -50%)',
  selectors: {
    '&[data-active="true"]': {
      backgroundColor: cssVarV2('icon/primary'),
    },
    '&[data-disabled="true"]': {
      cursor: 'not-allowed',
    },
  },
});
