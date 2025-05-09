import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { globalStyle, style } from '@vanilla-extract/css';

export const menuTriggerStyle = style({
  width: '150px',
  padding: '4px 10px',
  justifyContent: 'space-between',
});

export const rowContainerStyle = style({
  display: 'flex',
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '4px',
  selectors: {
    '&.clickable:hover': {
      backgroundColor: cssVarV2('layer/background/hoverOverlay'),
      cursor: 'pointer',
      borderRadius: '4px',
    },
  },
});

export const memberContainerStyle = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: '8px',
  fontSize: cssVar('fontSm'),
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flex: 1,
  overflow: 'hidden',
});
export const memberNameStyle = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});
export const descriptionStyle = style({
  textOverflow: 'ellipsis',
  overflow: 'hidden',
  whiteSpace: 'nowrap',
  width: '100%',
});

export const IconButtonStyle = style({
  flexShrink: 0,
  marginLeft: '8px',
  fontSize: '20px',
  display: 'flex',
  alignItems: 'center',
  color: cssVarV2('icon/primary'),
});

export const OwnerStyle = style({
  color: cssVarV2('text/secondary'),
  fontSize: cssVar('fontSm'),
  marginLeft: '8px',
});

export const avatarsContainerStyle = style({
  display: 'flex',
  flexDirection: 'row',
});

export const openWorkspaceSettingsStyle = style({
  color: cssVarV2('text/link'),
  fontSize: cssVar('fontXs'),
  fontWeight: 500,
  display: 'flex',
  gap: '8px',
  alignItems: 'center',
  justifyContent: 'flex-start',
  width: '100%',
  padding: '4px',
  cursor: 'pointer',
});
globalStyle(`${openWorkspaceSettingsStyle} svg`, {
  color: cssVarV2('text/link'),
});
