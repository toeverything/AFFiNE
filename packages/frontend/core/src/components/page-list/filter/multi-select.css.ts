import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';
export const content = style({
  fontSize: 12,
  color: cssVar('textPrimaryColor'),
  borderRadius: 8,
  padding: '3px 4px',
  cursor: 'pointer',
  overflow: 'hidden',
  ':hover': {
    backgroundColor: cssVar('hoverColor'),
  },
});
export const text = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: 350,
  selectors: {
    '&.empty': {
      color: 'var(--affine-text-secondary-color)',
    },
  },
});
export const optionList = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  padding: '0 4px',
  maxHeight: '220px',
});
export const scrollbar = style({
  vars: {
    '--scrollbar-width': '4px',
  },
});
export const selectOption = style({
  display: 'flex',
  alignItems: 'center',
  fontSize: 14,
  height: 26,
  borderRadius: 5,
  maxWidth: 240,
  minWidth: 100,
  padding: '0 12px',
  cursor: 'pointer',
  ':hover': {
    backgroundColor: cssVar('hoverColor'),
  },
});
export const optionLabel = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flex: 1,
});
export const done = style({
  display: 'flex',
  alignItems: 'center',
  color: cssVar('primaryColor'),
  marginLeft: 8,
});
