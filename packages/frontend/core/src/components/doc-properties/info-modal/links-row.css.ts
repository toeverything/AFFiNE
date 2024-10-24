import { cssVar } from '@toeverything/theme';
import { globalStyle, style } from '@vanilla-extract/css';

export const wrapper = style({
  width: '100%',
  borderRadius: 4,
  color: cssVar('textPrimaryColor'),
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  padding: 4,
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
