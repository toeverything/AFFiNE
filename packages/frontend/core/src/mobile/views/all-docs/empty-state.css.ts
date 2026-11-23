import {
  headlineRegular,
  subHeadlineRegular,
} from '@toeverything/theme/typography';
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
  width: 80,
  height: 80,
  objectFit: 'contain',
  marginBottom: 16,
  userSelect: 'none',
});

export const copy = style({
  width: '100%',
  maxWidth: 280,
  textAlign: 'center',
  marginBottom: 20,
});

export const title = style([
  headlineRegular,
  {
    margin: 0,
    color: cssVarV2('text/primary'),
  },
]);

export const description = style([
  subHeadlineRegular,
  {
    margin: '6px 0 0',
    color: cssVarV2('text/secondary'),
  },
]);

export const actionButton = style({
  borderRadius: 8,
});

export const actionIcon = style({
  fontSize: 20,
});
