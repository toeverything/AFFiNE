import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { globalStyle, style } from '@vanilla-extract/css';

export const root = style({
  display: 'flex',
  flexDirection: 'column',
});

export const section = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
});

export const cell = style({
  display: 'flex',
  gap: 4,
});

export const divider = style({
  margin: '8px 0',
});

export const spacer = style({
  flex: 1,
});

export const docRefLink = style({
  maxWidth: '50%',
  fontSize: cssVar('fontSm'),
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  color: cssVarV2('text/tertiary'),
});

export const cellList = style({
  padding: '0 2px',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
});

globalStyle(`${docRefLink} .affine-reference-title`, {
  border: 'none',
});
