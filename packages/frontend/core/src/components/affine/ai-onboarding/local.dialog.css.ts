import { cssVar } from '@toeverything/theme';
import { globalStyle, style } from '@vanilla-extract/css';

export const card = style({
  borderRadius: 12,
  boxShadow: cssVar('menuShadow'),
});

export const thumb = style({
  width: '100%',
  height: 211,
  borderRadius: 'inherit',
  borderBottomLeftRadius: 0,
  borderBottomRightRadius: 0,
  overflow: 'hidden',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
});

export const thumbContent = style({
  width: 'calc(100% + 4px)',
  height: 'calc(100% + 4px)',
});

export const title = style({
  fontWeight: 500,
});

export const footerActions = style({
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 12,
  marginTop: 8,
});

globalStyle(`${footerActions} > *, ${footerActions}`, {
  color: `${cssVar('textSecondaryColor')} !important`,
});
globalStyle(`${footerActions} > *:last-child`, {
  color: `${cssVar('textPrimaryColor')} !important`,
});

export const actionButton = style({
  fontSize: cssVar('fontSm'),
  padding: '0 2px',
  color: 'inherit !important',
});
