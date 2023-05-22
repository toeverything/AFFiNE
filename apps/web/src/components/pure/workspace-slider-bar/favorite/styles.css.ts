import { keyframes, style } from '@vanilla-extract/css';

export const label = style({
  selectors: {
    '&[data-untitled="true"]': {
      opacity: 0.6,
    },
  },
});

export const favItemWrapper = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  selectors: {
    '&[data-nested="true"]': {
      marginLeft: '12px',
      width: 'calc(100% - 12px)',
    },
  },
});

const slideDown = keyframes({
  '0%': {
    height: '0px',
  },
  '100%': {
    height: 'var(--radix-collapsible-content-height)',
  },
});

const slideUp = keyframes({
  '0%': {
    height: 'var(--radix-collapsible-content-height)',
  },
  '100%': {
    height: '0px',
  },
});

export const collapsibleContent = style({
  overflow: 'hidden',
  selectors: {
    '&[data-state="open"]': {
      animation: `${slideDown} 0.2s ease-out`,
    },
    '&[data-state="closed"]': {
      animation: `${slideUp} 0.2s ease-out`,
    },
  },
});

export const collapsibleContentInner = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
});
