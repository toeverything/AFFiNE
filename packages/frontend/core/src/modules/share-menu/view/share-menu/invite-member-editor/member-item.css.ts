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
  cursor: 'pointer',
  selectors: {
    '&:hover': {
      backgroundColor: cssVarV2('layer/background/hoverOverlay'),
      borderRadius: '4px',
    },
  },
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
