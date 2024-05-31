import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';

export const root = style({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  gap: 8,
});

export const button = style({
  color: cssVar('iconColor'),
  boxShadow: cssVar('shadow2'),
  borderRadius: 8,
  fontSize: '20px !important',
  ':hover': {
    background: cssVar('hoverColorFilled'),
  },
  pointerEvents: 'auto',
});
