import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';
export const wrapper = style({
  flexGrow: '1',
  height: '100%',
  // margin: '0 auto',
  padding: '40px 15px 20px 15px',
  display: 'flex',
  justifyContent: 'center',
});
export const centerContainer = style({
  width: '100%',
  maxWidth: '560px',
});
export const content = style({
  position: 'relative',
  width: '100%',
  marginBottom: '24px',
  minHeight: 'calc(100% - 48px)',
});
export const suggestionLink = style({
  fontSize: cssVar('fontSm'),
  color: cssVar('textPrimaryColor'),
  display: 'flex',
  alignItems: 'start',
  lineHeight: '22px',
  gap: '12px',
});
export const suggestionLinkIcon = style({
  color: cssVar('iconColor'),
  marginRight: '12px',
  display: 'flex',
  margin: '3px 0',
});
export const footer = style({
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  paddingBottom: '20px',
  gap: '4px',
  fontSize: cssVar('fontXs'),
  flexWrap: 'wrap',
});

export const link = style({
  color: cssVar('linkColor'),
  cursor: 'pointer',
});

export const centeredLoading = style({
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  height: '100%',
  width: '100%',
});
