import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';

export const workspaceScrollArea = style({
  display: 'flex',
  flexDirection: 'column',
});
export const workspaceScrollAreaViewport = style({
  padding: '10px 8px 0px 8px',
});
export const workspaceFooter = style({
  padding: '0px 8px 10px 8px',
});
export const scrollbar = style({
  width: 9,
  padding: '0px 2px',
  ':hover': {
    padding: 0,
  },
});
export const scrollbarThumb = style({
  width: 5,
});
export const signInWrapper = style({
  display: 'flex',
  width: '100%',
  gap: '12px',
  alignItems: 'center',
  justifyContent: 'flex-start',
  borderRadius: '8px',
});
export const iconContainer = style({
  width: '28px',
  padding: '2px 4px 4px',
  borderRadius: '14px',
  background: cssVar('white'),
  display: 'flex',
  border: `1px solid ${cssVar('iconSecondary')}`,
  color: cssVar('iconSecondary'),
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '20px',
});
export const signInTextContainer = style({
  display: 'flex',
  flexDirection: 'column',
});
export const signInTextPrimary = style({
  fontSize: cssVar('fontSm'),
  fontWeight: 600,
  lineHeight: '22px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});
export const signInTextSecondary = style({
  fontSize: cssVar('fontXs'),
  fontWeight: 400,
  lineHeight: '20px',
  color: cssVar('textSecondaryColor'),
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});
export const menuItem = style({
  borderRadius: '8px',
});
export const loadingWrapper = style({
  height: 42,
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
});
