import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';
export const leftContentText = style({
  fontSize: cssVar('fontBase'),
  fontWeight: 400,
  lineHeight: '1.6',
  maxWidth: '548px',
});
export const mail = style({
  color: cssVar('linkColor'),
  textDecoration: 'none',
  ':visited': {
    color: cssVar('linkColor'),
  },
});
