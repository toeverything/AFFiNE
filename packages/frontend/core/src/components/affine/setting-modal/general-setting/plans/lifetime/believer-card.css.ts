import { cssVar } from '@toeverything/theme';
import { createVar, globalStyle, style } from '@vanilla-extract/css';

export const affineIconGradientStart = createVar();
export const affineIconGradientStop = createVar();

const colorSchemes = {
  light: {
    dot: '#E0E0E0',
    affine: {
      start: '#fff',
      stop: '#fff',
    },
    icon: 'rgba(0,0,0,0.1)',
  },
  dark: {
    dot: 'rgba(255,255,255,0.1)',
    affine: {
      start: '#8C8C8C',
      stop: '#262626',
    },
    icon: 'transparent',
  },
};

export const card = style({
  position: 'relative',
  width: '100%',
  minHeight: 200,
  borderRadius: 16,
  padding: '20px 24px',
  border: `1px solid ${cssVar('borderColor')}`,
  overflow: 'hidden',
  background: cssVar('white'),
});

export const content = style({
  position: 'relative',
  zIndex: 3,
});

export const bg = style({
  vars: {
    '--dot': colorSchemes.light.dot,
  },
  width: '100%',
  height: '100%',
  position: 'absolute',
  top: 0,
  left: 0,
  backgroundImage:
    'radial-gradient(circle, var(--dot) 1.2px, transparent 1.2px)',
  backgroundSize: '12px 12px',
  backgroundRepeat: 'repeat',

  selectors: {
    '[data-theme="dark"] &': {
      vars: {
        '--dot': colorSchemes.dark.dot,
      },
    },

    [`${card}[data-type="1"] &::after`]: {
      background: `linear-gradient(231deg, transparent 0%, ${cssVar('white')} 80%)`,
    },
    [`${card}[data-type="2"] &::after`]: {
      background: `linear-gradient(290deg, transparent 0%, ${cssVar('white')} 40%)`,
    },
  },

  // Overlay
  '::after': {
    content: '""',
    position: 'absolute',
    width: '100%',
    height: '100%',
    top: 0,
    left: 0,
    zIndex: 1,
  },
});
globalStyle(`.${bg} > svg.affine-svg`, {
  vars: {
    [affineIconGradientStart]: colorSchemes.light.affine.start,
    [affineIconGradientStop]: colorSchemes.light.affine.stop,
  },
  position: 'absolute',
  zIndex: 0,
});
globalStyle(`[data-theme='dark'] .${bg} > svg.affine-svg`, {
  vars: {
    [affineIconGradientStart]: colorSchemes.dark.affine.start,
    [affineIconGradientStop]: colorSchemes.dark.affine.stop,
  },
});
globalStyle(` .${bg} > svg.icons-svg`, {
  color: colorSchemes.light.icon,
  position: 'absolute',
  zIndex: 2,
});
globalStyle(`[data-theme='dark'] .${bg} > svg.icons-svg`, {
  color: colorSchemes.dark.icon,
});

// --------- style1 ---------
globalStyle(`.${card}[data-type="1"] .${bg} > svg.affine-svg`, {
  right: -150,
  top: -100,
});

globalStyle(`.${card}[data-type="1"] .${bg} > svg.icons-svg`, {
  right: -20,
  top: 130,
  opacity: 0.5,
});

// --------- style2 ---------
globalStyle(`.${card}[data-type="2"] .${bg} > svg.affine-svg`, {
  position: 'absolute',
  right: -140,
  bottom: -130,
  transform: 'scale(0.58)',
});

globalStyle(`.${card}[data-type="2"] .${bg} > svg.icons-svg`, {
  position: 'absolute',
  right: 148,
  bottom: 16,
  opacity: 0.5,
});

globalStyle(`.${card}[data-type="2"] .${bg} > svg.icons-svg .star`, {
  display: 'none',
});
