import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const emptyState = style({
  width: '100%',
  minHeight:
    'calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 44px - 84px)',
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '8px 32px calc(env(safe-area-inset-bottom) + 96px)',
});

export const illustration = style({
  width: 96,
  height: 96,
  objectFit: 'contain',
  marginBottom: 24,
  userSelect: 'none',
});

export const copy = style({
  width: '100%',
  maxWidth: 280,
  textAlign: 'center',
  marginBottom: 28,
});

export const title = style({
  margin: 0,
  fontSize: 17,
  lineHeight: '24px',
  fontWeight: 700,
  color: cssVarV2('text/primary'),
});

export const description = style({
  margin: '10px 0 0',
  fontSize: 14,
  lineHeight: '20px',
  fontWeight: 400,
  color: cssVarV2('text/secondary'),
});

export const actionButton = style({
  minWidth: 164,
  borderRadius: 10,
  fontSize: 16,
  fontWeight: 600,
  boxShadow: `0 8px 18px ${cssVarV2('layer/insideBorder/border')}`,
});

export const actionIcon = style({
  fontSize: 20,
});
