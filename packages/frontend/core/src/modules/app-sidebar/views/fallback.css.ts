import { style } from '@vanilla-extract/css';

export const fallback = style({
  padding: '4px 20px',
  height: '100%',
  overflow: 'clip',
});

export const fallbackHeader = style({
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  flexDirection: 'row',
  gap: '8px',
  overflow: 'hidden',
  height: '52px',
});

export const spacer = style({
  flex: 1,
});

export const fallbackBody = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '42px',
  marginTop: '42px',
});

export const fallbackGroupItems = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
});

export const fallbackItemHeader = style({
  transform: 'translateX(-10px)',
});
