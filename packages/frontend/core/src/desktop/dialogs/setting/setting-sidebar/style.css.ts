import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { globalStyle, style } from '@vanilla-extract/css';
export const settingSlideBar = style({
  width: '25%',
  maxWidth: '242px',
  background: cssVar('backgroundSecondaryColor'),
  padding: '20px 0px 0px 12px',
  height: '100%',
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
  overflowY: 'auto',
});
export const sidebarTitle = style({
  fontSize: cssVar('fontH6'),
  fontWeight: '600',
  lineHeight: cssVar('lineHeight'),
  padding: '0 8px',
});
export const sidebarSubtitle = style({
  fontSize: cssVar('fontSm'),
  lineHeight: cssVar('lineHeight'),
  color: cssVar('textSecondaryColor'),
  padding: '4px 8px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
});
export const sidebarItemsWrapper = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
});
export const sidebarSelectItem = style({
  display: 'flex',
  alignItems: 'center',
  padding: '4px 8px',
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

export const sidebarSelectItemIcon = style({
  width: '16px',
  height: '16px',
  fontSize: '16px',
  marginRight: '10px',
  flexShrink: 0,
  color: cssVarV2('icon/primary'),
  display: 'inline-flex',
});

export const sidebarSelectItemName = style({
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flexGrow: 1,
});

export const sidebarSelectItemBeta = style({
  fontSize: cssVar('fontXs'),
  color: cssVarV2('text/primary'),
  background: cssVarV2('chip/label/blue'),
  height: 20,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 8px',
  borderRadius: '4px',
  transform: 'translateX(2px)',
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

export const sidebarGroup = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  paddingRight: '12px',
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
