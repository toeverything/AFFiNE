import { cssVar } from '@toeverything/theme';
import { createVar, keyframes, style } from '@vanilla-extract/css';

export const aiIslandWrapper = style({
  width: 44,
  height: 44,
  position: 'relative',
  transform: 'translateY(0)',
  transition: 'transform 0.2s ease',

  selectors: {
    '&[data-hide="true"]': {
      transform: 'translateY(120px)',
      transitionDelay: '0.2s',
    },
  },
});
export const aiIslandBtn = style({
  width: 'inherit',
  height: 'inherit',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '50%',
  color: cssVar('iconColor'),
  border: `0.5px solid ${cssVar('borderColor')}`,
  boxShadow: '0px 2px 2px rgba(0,0,0,0.05)',
  background: cssVar('backgroundOverlayPanelColor'),
  position: 'relative',

  selectors: {
    [`${aiIslandWrapper}[data-animation="true"] &`]: {
      borderColor: 'transparent',
    },
    '&:hover::after': {
      content: '""',
      position: 'absolute',
      inset: 0,
      borderRadius: '50%',
      background: cssVar('hoverColor'),
    },
  },
});

// -------- animation --------
export const borderAngle1 = createVar('border-angle-1');
export const borderAngle2 = createVar('border-angle-2');
export const borderAngle3 = createVar('border-angle-3');
const brightBlue = createVar('bright-blue');
const brightGreen = createVar('bright-green');
const brightRed = createVar('bright-red');
const borderWidth = createVar('border-width');

const rotateBg = keyframes({
  to: { transform: 'rotate(360deg)' },
});

export const aiIslandAnimationBg = style({
  width: 'inherit',
  height: 'inherit',
  top: 0,
  left: 0,
  position: 'absolute',
  borderRadius: '50%',
  overflow: 'hidden',

  vars: {
    [borderAngle1]: '0deg',
    [borderAngle2]: '90deg',
    [borderAngle3]: '180deg',
    [brightBlue]: 'rgb(0, 100, 255)',
    [brightGreen]: '#1E96EB',
    [brightRed]: 'rgb(0, 200, 255)',
    [borderWidth]: '1.5px',
  },
  backgroundColor: 'transparent',

  selectors: {
    [`${aiIslandWrapper}[data-animation="true"] &`]: {
      width: `calc(100% + 2 * ${borderWidth})`,
      height: `calc(100% + 2 * ${borderWidth})`,
      top: `calc(-1 * ${borderWidth})`,
      left: `calc(-1 * ${borderWidth})`,
    },
  },
});

export const gradient = style({
  position: 'absolute',
  width: '100%',
  height: '100%',
  borderRadius: 'inherit',
  animationName: rotateBg,
  animationIterationCount: 'infinite',
  animationTimingFunction: 'linear',
  pointerEvents: 'none',
  willChange: 'transform',
  selectors: {
    [`&:nth-of-type(1)`]: {
      animationDuration: '3s',
      backgroundImage: `conic-gradient(from ${borderAngle1} at 50% 50%, 
        transparent, ${brightBlue} 10%, 
        transparent 30%, 
        transparent
      )`,
    },
    [`&:nth-of-type(2)`]: {
      animationDuration: '8s',
      backgroundImage: `conic-gradient(from ${borderAngle2} at 50% 50%,
        transparent, ${brightGreen} 10%,
        transparent 60%,
        transparent
      )`,
    },
    [`&:nth-of-type(3)`]: {
      animationDuration: '13s',
      backgroundImage: `conic-gradient(from ${borderAngle3} at 50% 50%,
        transparent, ${brightRed} 10%,
        transparent 50%,
        transparent
      )`,
    },
  },
});
