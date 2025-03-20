import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const viewInPageNotifyFooter = style({
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '12px',
});

export const viewInPageNotifyFooterButton = style({
  padding: '0px 6px',
  borderRadius: '4px',
  color: cssVarV2('text/primary'),

  fontSize: cssVar('fontSm'),
  lineHeight: '22px',
  fontWeight: '500',
  textAlign: 'center',

  ':hover': {
    background: cssVarV2('layer/background/hoverOverlay'),
  },
});
