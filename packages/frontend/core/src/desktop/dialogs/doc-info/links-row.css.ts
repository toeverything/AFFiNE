import { cssVar } from '@toeverything/theme';
import { globalStyle, style } from '@vanilla-extract/css';

export const title = style({
  fontSize: cssVar('fontSm'),
  fontWeight: '500',
  color: cssVar('textSecondaryColor'),
  padding: '6px',
});

export const wrapper = style({
  width: '100%',
  borderRadius: 4,
  color: cssVar('textPrimaryColor'),
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: 2,
  padding: '6px',
  ':hover': {
    backgroundColor: cssVar('hoverColor'),
  },
});

globalStyle(`${wrapper} svg`, {
  color: cssVar('iconSecondary'),
  fontSize: 16,
  transform: 'none',
});
globalStyle(`${wrapper} span`, {
  fontSize: cssVar('fontSm'),
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  // don't modify border width to avoid layout shift
  borderBottomColor: 'transparent',
});
