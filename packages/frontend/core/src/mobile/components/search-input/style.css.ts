import { cssVarV2 } from '@toeverything/theme/v2';
import { generateIdentifier, style } from '@vanilla-extract/css';

export const searchVTName = generateIdentifier('mobile-search-input');
export const searchVTScope = generateIdentifier('mobile-search');

export const wrapper = style({
  position: 'relative',
  backgroundColor: cssVarV2('layer/background/primary'),

  selectors: {
    [`[data-${searchVTScope}] &`]: {
      viewTransitionName: searchVTName,
    },
  },
});

export const prefixIcon = style({
  position: 'absolute',
  width: 36,
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: cssVarV2('icon/primary'),
  pointerEvents: 'none',
});

export const input = style({
  padding: '11px 8px 11px 36px',
  width: '100%',
  height: '100%',
  outline: 'none',
  border: 'none',

  fontWeight: 400,
  fontSize: 17,
  lineHeight: '22px',
  letterSpacing: -0.43,
});

export const placeholder = style([
  input,
  {
    position: 'absolute',
    left: 0,
    top: 0,
    pointerEvents: 'none',
    color: cssVarV2('text/secondary'),
  },
]);
