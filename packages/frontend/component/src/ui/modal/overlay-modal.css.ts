import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';

export const title = style({
  padding: '20px 24px 8px 24px',
  fontSize: cssVar('fontH6'),
  fontFamily: cssVar('fontFamily'),
  fontWeight: '600',
  lineHeight: '26px',
});

export const content = style({
  padding: '0px 24px 8px',
  fontSize: cssVar('fontBase'),
  lineHeight: '24px',
  fontWeight: 400,
});

export const footer = style({
  padding: '20px 24px',
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '20px',
});

export const gotItBtn = style({
  fontWeight: 500,
});

export const buttonText = style({
  color: cssVar('pureWhite'),
  textDecoration: 'none',
  cursor: 'pointer',
  ':visited': {
    color: cssVar('pureWhite'),
  },
});
