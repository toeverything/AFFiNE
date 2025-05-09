import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const fakeWrapper = style({
  position: 'relative',
  opacity: 0.4,
  marginTop: '24px',
  selectors: {
    '&::after': {
      content: '""',
      width: '100%',
      height: '100%',
      position: 'absolute',
      left: 0,
      top: 0,
      cursor: 'not-allowed',
    },
  },
});

export const membersPanel = style({
  padding: '4px',
  borderRadius: '12px',
  background: cssVarV2('layer/background/primary'),
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
});

export const localMembersPanel = style({
  gap: '24px',
  display: 'flex',
  flexDirection: 'column',
});

export const goUpgradeWrapper = style({
  display: 'inline-flex',
  alignItems: 'center',
});

export const goUpgrade = style({
  fontSize: cssVar('fontXs'),
  color: cssVarV2('text/emphasis'),
  cursor: 'pointer',
  marginLeft: '4px',
  display: 'inline',
});

export const errorStyle = style({
  color: cssVarV2('status/error'),
});

export const membersFallback = style({
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'flexStart',
  color: cssVarV2('text/secondary'),
  gap: '4px',
  padding: '8px',
  fontSize: cssVar('fontXs'),
});

export const memberListItem = style({
  padding: '0 4px 0 16px',
  height: '58px',
  display: 'flex',
  width: '100%',
  alignItems: 'center',
  selectors: {
    '&:hover': {
      background: cssVarV2('layer/background/hoverOverlay'),
      borderRadius: '8px',
    },
    '&:not(:last-of-type)': {
      marginBottom: '6px',
    },
  },
});
export const memberContainer = style({
  width: '250px',
  display: 'flex',
  flexDirection: 'column',
  flexShrink: 0,
  marginLeft: '12px',
  marginRight: '20px',
});

export const roleOrStatus = style({
  flexGrow: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: cssVar('fontSm'),
  selectors: {
    '&.pending': {
      color: cssVarV2('text/emphasis'),
    },
    '&.error': {
      color: cssVarV2('status/error'),
    },
  },
});

export const memberName = style({
  fontSize: cssVar('fontSm'),
  color: cssVarV2('text/primary'),
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  lineHeight: '22px',
});

export const memberEmail = style({
  fontSize: cssVar('fontXs'),
  color: cssVarV2('text/secondary'),
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  lineHeight: '20px',
});

export const confirmAssignModalContent = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  padding: '0',
});

export const descriptions = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
});

export const description = style({
  display: 'flex',
});

export const prefixDot = style({
  background: cssVarV2('icon/activated'),
  width: '5px',
  height: '5px',
  borderRadius: '50%',
  marginRight: '12px',
  marginTop: '10px',
});

export const confirmInputContainer = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  marginTop: '12px',
  marginBottom: '20px',
});

export const importButton = style({
  padding: '4px 8px',
});
