import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const property = style({
  padding: '3px 4px',
});

export const root = style({
  height: '100%',
  display: 'flex',
  gap: 2,
  alignItems: 'center',
});

export const checkbox = style({
  fontSize: 24,
  color: cssVarV2('icon/primary'),
});

export const date = style({
  fontSize: cssVar('fontSm'),
  color: cssVarV2('text/primary'),
  lineHeight: '22px',
  padding: '0 4px',
  borderRadius: 4,
  whiteSpace: 'nowrap',

  selectors: {
    '&:hover:not([data-disabled])': {
      background: cssVarV2('layer/background/hoverOverlay'),
    },
  },
});

export const duplicateTag = style({
  padding: '0 8px',
  border: `1px solid ${cssVarV2('database/border')}`,
  background: cssVarV2('layer/background/error'),
  color: cssVarV2('toast/iconState/error'),
  borderRadius: 4,
});
