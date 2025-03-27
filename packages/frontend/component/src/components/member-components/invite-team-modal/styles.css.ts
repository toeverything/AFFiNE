import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { globalStyle, style } from '@vanilla-extract/css';

export const inviteModalTitle = style({
  fontWeight: '600',
  fontSize: cssVar('fontH6'),
  marginBottom: '20px',
});

export const inviteModalContent = style({
  marginBottom: '10px',
});

export const inviteModalButtonContainer = style({
  display: 'flex',
  justifyContent: 'flex-end',
  // marginTop: 10,
});

export const inviteName = style({
  marginLeft: '4px',
  marginRight: '10px',
  color: cssVarV2('text/primary'),
});

export const pagination = style({
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  gap: '6px',
  marginTop: 5,
});

export const pageItem = style({
  display: 'inline-flex',
  justifyContent: 'center',
  alignItems: 'center',
  width: '20px',
  height: '20px',
  fontSize: cssVar('fontXs'),
  color: cssVarV2('text/primary'),
  borderRadius: '4px',

  selectors: {
    '&:hover': {
      background: cssVarV2('layer/background/hoverOverlay'),
    },
    '&.active': {
      color: cssVarV2('text/emphasis'),
      cursor: 'default',
      pointerEvents: 'none',
    },
    '&.label': {
      color: cssVarV2('icon/primary'),
      fontSize: '16px',
    },
    '&.disabled': {
      opacity: '.4',
      cursor: 'default',
      color: cssVarV2('text/disable'),
      pointerEvents: 'none',
    },
  },
});
globalStyle(`${pageItem} a`, {
  width: '100%',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
});

export const modalContent = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
});

export const modalSubTitle = style({
  fontSize: cssVar('fontSm'),
  fontWeight: '500',
});

export const invitationLinkContainer = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
});

export const radioItem = style({
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
});

export const iconStyle = style({
  color: cssVarV2('icon/primary'),
  fontSize: '16px',
});

export const errorHint = style({
  color: cssVarV2('status/error'),
  fontSize: cssVar('fontXs'),
});

export const contentStyle = style({
  paddingLeft: '0',
  paddingRight: '0',
  overflowY: 'visible',
});

export const invitationLinkContent = style({
  display: 'flex',
  gap: '8px',
});

export const invitationLinkDescription = style({
  color: cssVarV2('text/secondary'),
  fontSize: cssVar('fontSm'),
});
