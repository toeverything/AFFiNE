import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';

export const container = style({
  maxWidth: 480,
  minWidth: 360,
  padding: '20px 0',
  alignSelf: 'start',
  marginTop: '120px',
});

export const titleContainer = style({
  display: 'flex',
  width: '100%',
  flexDirection: 'column',
});

export const titleStyle = style({
  fontSize: cssVar('fontH6'),
  fontWeight: '600',
});

export const rowNameContainer = style({
  display: 'flex',
  flexDirection: 'row',
  gap: 6,
  padding: 6,
  width: '160px',
});

export const viewport = style({
  maxHeight: 'calc(100vh - 220px)',
  padding: '0 24px',
});

export const scrollBar = style({
  width: 6,
  transform: 'translateX(-4px)',
});
