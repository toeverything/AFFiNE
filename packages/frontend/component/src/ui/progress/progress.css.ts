import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { createVar, style } from '@vanilla-extract/css';

const progressHeight = createVar();

export const root = style({
  height: '20px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: '100%',
  gap: 12,
  vars: {
    [progressHeight]: '10px',
  },
});

export const progress = style({
  height: progressHeight,
  flex: 1,
  background: cssVarV2('layer/background/hoverOverlay'),
  borderRadius: 5,
  position: 'relative',
});

export const sliderRoot = style({
  height: progressHeight,
  width: '100%',
  position: 'absolute',
  top: 0,
  left: 0,
});

export const thumb = style({
  width: 28,
  height: 28,
  transform: 'translate(1px, -9px)',
  borderRadius: '50%',
  display: 'block',
  background: cssVarV2('layer/background/primary'),
  boxShadow: cssVar('overlayPanelShadow'),
  opacity: 0,
  transition: 'opacity 0.1s ease-in-out',
  selectors: {
    [`${root}:hover &, &:is(:focus-visible, :focus-within)`]: {
      opacity: 1,
    },
  },
});

export const label = style({
  width: '40px',
  fontSize: cssVar('fontSm'),
  textAlign: 'end',
});

export const indicator = style({
  height: '100%',
  width: '100%',
  borderRadius: 5,
  background: cssVarV2('toast/iconState/regular'),
  transition: 'background 0.2s ease-in-out',
  selectors: {
    [`${root}:hover &, &:has(${thumb}:is(:focus-visible, :focus-within, :active))`]:
      {
        borderTopRightRadius: 0,
        borderBottomRightRadius: 0,
      },
    [`[data-state="complete"]&`]: {
      background: cssVarV2('status/success'),
    },
  },
});
