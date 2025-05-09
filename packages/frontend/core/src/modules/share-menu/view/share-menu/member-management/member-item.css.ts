import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const memberItemStyle = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '4px',
  width: '100%',
  gap: '12px',
});

export const memberContainerStyle = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: '12px',
  flex: 1,
  overflow: 'hidden',
  width: '100%',
});

export const memberInfoStyle = style({
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  overflow: 'hidden',
});

export const memberNameStyle = style({
  color: cssVarV2('text/primary'),
  fontSize: cssVar('fontSm'),
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
});

export const memberEmailStyle = style({
  color: cssVarV2('text/secondary'),
  fontSize: cssVar('fontXs'),
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
});

export const memberRoleStyle = style({
  color: cssVarV2('text/primary'),
  fontSize: cssVar('fontSm'),
  flexShrink: 0,
  selectors: {
    '&.disable': {
      color: cssVarV2('text/disable'),
    },
  },
});

export const tooltipContentStyle = style({
  wordBreak: 'break-word',
});

export const menuTriggerStyle = style({
  padding: '4px',
  paddingRight: '0',
  borderRadius: '4px',
  gap: '4px',
  display: 'flex',
  fontSize: cssVar('fontSm'),
  fontWeight: 400,
});

export const remove = style({
  color: cssVarV2('status/error'),
});
export const planTagContainer = style({
  display: 'flex',
  gap: '8px',
  alignItems: 'center',
});
