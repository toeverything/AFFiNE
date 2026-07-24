import { cssVarV2 } from '@toeverything/theme/v2';
import { keyframes, style } from '@vanilla-extract/css';

const shineAnimation = keyframes({
  '0%': {
    transform: 'translateX(-100%)',
  },
  '100%': {
    transform: 'translateX(100%)',
  },
});
export const hotTag = style({
  background: cssVarV2('chip/tag/red'),
  padding: '0px 8px',
  borderRadius: 20,
  lineHeight: '20px',
  fontSize: 12,
  fontWeight: 500,
  color: 'white',
  position: 'relative',
  overflow: 'hidden',

  border: '0.5px solid red',
  boxShadow: '0px 2px 3px rgba(0,0,0,0.1), 0px 0px 3px rgba(255,0,0, 0.5)',

  vars: {
    '--shine-color': 'rgba(255,255,255,0.5)',
  },

  selectors: {
    '&::after': {
      content: "''",
      position: 'absolute',
      left: 0,
      top: 0,
      pointerEvents: 'none',
      width: '100%',
      height: '100%',
      transform: 'translateX(-100%)',
      animation: `${shineAnimation} 900ms ease-out`,
      animationFillMode: 'forwards',

      backgroundImage: `linear-gradient(90deg, transparent 0%, var(--shine-color) 50%, transparent 100%)`,
      backgroundRepeat: 'no-repeat, no-repeat',
      backgroundSize: '100% 100%',
    },
  },
  '@media': {
    '(prefers-reduced-motion: reduce)': {
      selectors: {
        '&::after': {
          animation: 'none',
        },
      },
    },
  },
});
