import { cssVar } from '@toeverything/theme';
import { globalStyle, style } from '@vanilla-extract/css';
export const baseContainer = style({
  padding: '4px 16px',
  display: 'flex',
  flexFlow: 'column nowrap',
  ':empty': {
    display: 'none',
  },
});
export const scrollableContainerRoot = style({
  flex: '1 1 auto',
  overflowY: 'hidden',
  vars: {
    '--scrollbar-width': '10px',
  },
});
export const scrollTopBorder = style({
  position: 'absolute',
  top: 0,
  left: '16px',
  right: '16px',
  height: '1px',
  transition: 'opacity .3s .2s',
  opacity: 0,
  background: cssVar('black10'),
  selectors: {
    '&[data-has-scroll-top="true"]': {
      opacity: 1,
    },
  },
});
export const scrollableViewport = style({
  height: '100%',
  marginTop: '4px',
  // safe area to avoid bottom clipping
  paddingBottom: 8,
});
globalStyle(`${scrollableViewport} > div`, {
  maxWidth: '100%',
  display: 'block !important',
});
export const scrollableContainer = style([
  baseContainer,
  {
    height: '100%',
    padding: '0px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
]);
export const scrollbar = style({
  display: 'flex',
  flexDirection: 'column',
  userSelect: 'none',
  touchAction: 'none',
  padding: '0 2px',
  width: 'var(--scrollbar-width)',
  height: '100%',
  opacity: 1,
  transition: 'opacity .15s',
  selectors: {
    '&[data-state="hidden"]': {
      opacity: 0,
    },
  },
});
export const scrollbarThumb = style({
  position: 'relative',
  background: cssVar('black30'),
  borderRadius: '4px',
  overflow: 'hidden',
  selectors: {
    '&::before': {
      content: '""',
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: '100%',
      height: '100%',
      minWidth: '44px',
      minHeight: '44px',
    },
  },
});
