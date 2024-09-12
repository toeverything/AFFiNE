import { createVar, globalStyle, style } from '@vanilla-extract/css';

const bgColor = createVar();
const dotColor = createVar();

export const root = style({
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  pointerEvents: 'none',
  zIndex: -1,
});

export const dotBg = style({
  height: '100%',
  width: '100%',
  position: 'absolute',
  zIndex: -1,
  top: 0,
  left: 0,
  backgroundImage: `linear-gradient(to bottom, transparent 0%, ${bgColor} 90%),
     radial-gradient(${dotColor} 2px, transparent 2px),
     radial-gradient(${dotColor} 2px, transparent 2px)`,
  backgroundSize: '100% 100%, 20px 20px, 20px 20px',
});

export const arts = style({
  paddingTop: 60,
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
});

globalStyle(`[data-theme="light"] ${root}`, {
  vars: {
    [bgColor]: '#fff',
    [dotColor]: '#d9d9d9',
  },
});

globalStyle(`[data-theme="dark"] ${root}`, {
  vars: {
    [bgColor]: '#141414',
    [dotColor]: '#393939',
  },
});
