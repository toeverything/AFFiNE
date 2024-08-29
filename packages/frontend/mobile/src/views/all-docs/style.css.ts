import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const header = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 16,
  padding: '16px 16px 0px 16px',

  position: 'sticky',
  top: 0,
  backgroundColor: cssVarV2('layer/background/secondary'),
  zIndex: 1,
});
export const tabs = style({
  height: 56,
  gap: 16,
  display: 'flex',
  alignItems: 'center',
});
export const tab = style({
  fontSize: 20,
  fontWeight: 600,
  lineHeight: '28px',
  color: cssVarV2('text/tertiary'),
  selectors: {
    '&[data-active="true"]': {
      color: cssVarV2('text/primary'),
    },
  },
});
