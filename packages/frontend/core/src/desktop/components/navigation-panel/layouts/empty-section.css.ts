import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const content = style({
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 4,
  padding: '12px 0px',
  borderRadius: 8,
  selectors: {
    // assume that the section can be dragged over
    '&[data-dragged-over="true"]': {
      backgroundColor: cssVarV2('layer/background/hoverOverlay'),
    },
  },
});
export const iconWrapper = style({
  width: 36,
  height: 36,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '50%',
  backgroundColor: cssVarV2('button/emptyIconBackground'),
});
export const icon = style({
  fontSize: 20,
  color: cssVarV2('icon/secondary'),
});
export const message = style({
  fontSize: cssVar('fontSm'),
  textAlign: 'center',
  color: cssVarV2('text/tertiary'),
  userSelect: 'none',
  fontWeight: 400,
  lineHeight: '22px',
});

export const newButton = style({
  marginTop: 8,
  padding: '4px 8px',
  height: '30px',
  fontSize: cssVar('fontSm'),
});
