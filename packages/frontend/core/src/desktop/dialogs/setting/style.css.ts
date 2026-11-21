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

// 999.14: mobile layout of the full settings menu (section list, then a
// full-screen panel with a back bar).
export const mobileRoot = style({
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  height: '100%',
  overflow: 'hidden',
});
export const mobileSidebar = style({
  // `&&` doubles the specificity: the sidebar's own `settingSlideBar` rule
  // (width 25%, maxWidth 242px) is also a single class and its stylesheet
  // loads later, so a plain class lost (recorded: 94px wide on a 375px phone).
  selectors: {
    '&&': {
      width: '100%',
      maxWidth: 'none',
      padding: '12px 12px 0 12px',
    },
  },
});
export const mobileBackBar = style({
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '8px 12px',
  flexShrink: 0,
  cursor: 'pointer',
  fontSize: cssVar('fontBase'),
  color: cssVar('textSecondaryColor'),
});
export const mobileWrapper = style({
  // desktop panels start with 40px top padding sized for a wide modal
  selectors: {
    '&&': {
      padding: '8px 12px 20px 12px',
    },
  },
});
