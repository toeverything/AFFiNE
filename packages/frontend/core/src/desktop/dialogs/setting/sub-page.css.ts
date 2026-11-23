import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const root = style({
  width: '100%',
  position: 'absolute',
  left: 0,
  top: 0,
  height: '100%',
  pointerEvents: 'none',
});

export const mask = style({
  width: '100%',
  height: '100%',
  position: 'absolute',
  top: 0,
  left: 0,
  zIndex: 1,
  backgroundColor: 'rgba(0, 0, 0, 0.2)',
  pointerEvents: 'none',
  opacity: 0,
});

export const page = style({
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  zIndex: 1,
  backgroundColor: cssVarV2.layer.background.primary,
  transform: 'translateX(100%)',
  pointerEvents: 'auto',
  display: 'flex',
  flexDirection: 'column',
});

export const viewport = style({
  paddingTop: 16,
});

export const header = style({
  padding: '12px 0px 8px 16px',
  flexShrink: 0,
});
export const content = style({
  height: '0 !important',
  flex: 1,
});
export const backButton = style({
  fontWeight: 500,
  fontSize: 12,
  lineHeight: '20px',
});
