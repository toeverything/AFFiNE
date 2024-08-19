import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const trackStyle = style({
  width: '100%',
  height: '1px',
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  padding: '12px 0',
  cursor: 'pointer',
});
export const fakeTrackStyle = style({
  width: '100%',
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
  width: '8px',
  height: '8px',
  backgroundColor: cssVarV2('icon/primary'),
  borderRadius: '50%',
  position: 'absolute',
  top: '50%',
  transform: 'translate(-50%, -50%)',
  cursor: 'pointer',
});

export const nodeStyle = style({
  width: '4px',
  height: '4px',
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
  },
});
