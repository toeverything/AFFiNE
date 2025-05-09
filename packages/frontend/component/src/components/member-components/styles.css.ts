import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

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
});

export const inviteName = style({
  color: cssVarV2('text/primary'),
  fontWeight: '600',
});

export const avatarWrapper = style({
  verticalAlign: 'sub',
  display: 'inline-block',
});

export const userInfoWrapper = style({
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  marginTop: '28px',
});

export const lineHeight = style({
  lineHeight: '1.5',
});

export const content = style({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '8px',
});

export const userWrapper = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
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

export const importButton = style({
  padding: '4px 8px',
});
