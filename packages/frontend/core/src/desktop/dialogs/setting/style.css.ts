import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';
export const wrapper = style({
  height: '100%',
  padding: '40px 15px 20px 15px',
  display: 'flex',
});
export const centerContainer = style({
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  height: 'fit-content',
});
export const content = style({
  position: 'relative',
  width: '100%',
  marginBottom: '24px',
  minHeight: 'calc(var(--setting-modal-height) - 124px)',
  maxWidth: '560px',
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
  marginInlineEnd: '12px',
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
  maxWidth: '560px',
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
