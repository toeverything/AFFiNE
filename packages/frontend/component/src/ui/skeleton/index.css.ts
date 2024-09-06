import { cssVar } from '@toeverything/theme';
import { keyframes, style } from '@vanilla-extract/css';
// variables
const bg = cssVar('placeholderColor');
const highlight = 'rgba(255, 255, 255, 0.4)';
const defaultHeight = '32px';
const pulseKeyframes = keyframes({
  '0%': {
    opacity: 1,
  },
  '50%': {
    opacity: 0.5,
  },
  '100%': {
    opacity: 1,
  },
});
const waveKeyframes = keyframes({
  '0%': {
    transform: 'translateX(-100%)',
  },
  '50%': {
    transform: 'translateX(100%)',
  },
  '100%': {
    transform: 'translateX(100%)',
  },
});
export const root = style({
  display: 'block',
  width: '100%',
  maxWidth: '100%',
  height: defaultHeight,
  flexShrink: 0,
  /**
   * paint background in ::before,
   * so that we can use opacity to control the color
   **/
  position: 'relative',
  '::before': {
    content: '',
    position: 'absolute',
    borderRadius: 'inherit',
    inset: 0,
    opacity: 0.3,
    backgroundColor: bg,
  },
});
export const variant = {
  circular: style({
    width: defaultHeight,
    borderRadius: '50%',
  }),
  rectangular: style({
    borderRadius: '4px',
  }),
  rounded: style({
    borderRadius: '8px',
  }),
  text: style({
    borderRadius: '4px',
    height: '1.2em',
    marginTop: '0.2em',
    marginBottom: '0.2em',
  }),
};
export const animation = {
  pulse: style({
    animation: `${pulseKeyframes} 2s ease-in-out 0.5s infinite`,
  }),
  wave: style({
    position: 'relative',
    overflow: 'hidden',
    /* Fix bug in Safari https://bugs.webkit.org/show_bug.cgi?id=68196 */
    WebkitMaskImage: '-webkit-radial-gradient(white, black)',
    '::after': {
      animation: `${waveKeyframes} 2s linear 0.5s infinite`,
      background: `linear-gradient(
        90deg,
        transparent,
        ${highlight},
        transparent
      )`,
      content: '',
      position: 'absolute',
      transform:
        'translateX(-100%)' /* Avoid flash during server-side hydration */,
      bottom: 0,
      left: 0,
      right: 0,
      top: 0,
    },
  }),
};
