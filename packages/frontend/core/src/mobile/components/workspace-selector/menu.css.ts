import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const root = style({
  maxHeight:
    'calc(100dvh - 100px - env(safe-area-inset-bottom) - env(safe-area-inset-top))',
  display: 'flex',
  flexDirection: 'column',
});

export const divider = style({
  height: 16,
  display: 'flex',
  alignItems: 'center',
  position: 'relative',
  ':before': {
    content: '""',
    width: '100%',
    height: 0.5,
    background: cssVar('dividerColor'),
  },
});

export const head = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 4,
  padding: '10px 16px',
  fontSize: 17,
  fontWeight: 600,
  lineHeight: '22px',
  letterSpacing: -0.43,
  color: cssVarV2('text/primary'),
});
export const body = style({
  overflowY: 'auto',
  flexShrink: 0,
  flex: 1,
});
export const wsList = style({});
export const wsListTitle = style({
  padding: '6px 16px',
  fontSize: 13,
  lineHeight: '18px',
  letterSpacing: -0.08,
  color: cssVar('textSecondaryColor'),
});
export const wsItem = style({
  padding: '4px 12px',
});
export const wsCard = style({
  display: 'flex',
  alignItems: 'center',
  border: 'none',
  background: 'none',
  width: '100%',
  padding: 8,
  borderRadius: 8,
  gap: 8,

  ':active': {
    background: cssVarV2('layer/background/hoverOverlay'),
  },
});
export const wsName = style({
  width: 0,
  flex: 1,
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  fontSize: 17,
  lineHeight: '22px',
  letterSpacing: -0.43,
  textAlign: 'left',
});
