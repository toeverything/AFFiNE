import { cssVar } from '@toeverything/theme';
import { globalStyle, style } from '@vanilla-extract/css';
export const settingSlideBar = style({
  width: '25%',
  maxWidth: '242px',
  background: cssVar('backgroundSecondaryColor'),
  padding: '20px 0px',
  height: '100%',
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column',
});
export const sidebarTitle = style({
  fontSize: cssVar('fontH6'),
  fontWeight: '600',
  lineHeight: cssVar('lineHeight'),
  padding: '0px 16px 0px 24px',
});
export const sidebarSubtitle = style({
  fontSize: cssVar('fontSm'),
  lineHeight: cssVar('lineHeight'),
  color: cssVar('textSecondaryColor'),
  padding: '0px 16px 0px 24px',
  marginTop: '20px',
  marginBottom: '4px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
});
export const sidebarItemsWrapper = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  selectors: {
    '&.scroll': {
      flexGrow: 1,
      overflowY: 'auto',
    },
  },
});
export const sidebarSelectItem = style({
  display: 'flex',
  alignItems: 'center',
  margin: '0px 16px',
  padding: '0px 8px',
  height: '30px',
  flexShrink: 0,
  fontSize: cssVar('fontSm'),
  borderRadius: '8px',
  cursor: 'pointer',
  userSelect: 'none',
  ':hover': {
    background: cssVar('hoverColor'),
  },
  selectors: {
    '&.active': {
      background: cssVar('hoverColor'),
    },
  },
});
export const sidebarSelectSubItem = style({
  display: 'flex',
  alignItems: 'center',
  margin: '0px 16px',
  padding: '0px 8px 0px 32px',
  height: '30px',
  flexShrink: 0,
  fontSize: cssVar('fontSm'),
  borderRadius: '8px',
  cursor: 'pointer',
  userSelect: 'none',
  color: cssVar('textSecondaryColor'),
  selectors: {
    '&.active, &:hover': {
      color: cssVar('textPrimaryColor'),
    },
  },
});
globalStyle(`${settingSlideBar} .icon`, {
  width: '16px',
  height: '16px',
  marginRight: '10px',
  flexShrink: 0,
});
globalStyle(`${settingSlideBar} .setting-name`, {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flexGrow: 1,
});
export const currentWorkspaceLabel = style({
  width: '20px',
  height: '20px',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  selectors: {
    '&::after': {
      content: '""',
      width: '8px',
      height: '8px',
      borderRadius: '50%',
      background: cssVar('blue'),
    },
  },
});
export const sidebarFooter = style({
  padding: '0 16px',
});
export const accountButton = style({
  padding: '4px 8px',
  borderRadius: '8px',
  cursor: 'pointer',
  userSelect: 'none',
  display: 'flex',
  columnGap: '10px',
  justifyContent: 'space-between',
  alignItems: 'center',
  ':hover': {
    background: cssVar('hoverColor'),
  },
  selectors: {
    '&.active': {
      background: cssVar('hoverColor'),
    },
  },
});
globalStyle(`${accountButton} .avatar`, {
  width: '28px',
  height: '28px',
  borderRadius: '50%',
  fontSize: '20px',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  flexShrink: 0,
});
globalStyle(`${accountButton} .avatar.not-sign`, {
  color: cssVar('iconSecondary'),
  background: cssVar('white'),
  paddingBottom: '2px',
  border: `1px solid ${cssVar('iconSecondary')}`,
});
globalStyle(`${accountButton} .content`, {
  flexGrow: '1',
  minWidth: 0,
});
globalStyle(`${accountButton} .name-container`, {
  display: 'flex',
  justifyContent: 'flex-start',
  alignItems: 'center',
  width: '100%',
  gap: '4px',
  height: '22px',
});
globalStyle(`${accountButton} .name`, {
  fontSize: cssVar('fontSm'),
  fontWeight: 600,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  height: '22px',
});
globalStyle(`${accountButton} .email`, {
  fontSize: cssVar('fontXs'),
  color: cssVar('textSecondaryColor'),
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flexGrow: 1,
  height: '20px',
});
