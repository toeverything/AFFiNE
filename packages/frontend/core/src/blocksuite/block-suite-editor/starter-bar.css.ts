import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

import { container } from './bi-directional-link-panel.css';

export const root = style([
  container,
  {
    paddingBottom: 6,
    display: 'flex',
    gap: 8,
    alignItems: 'center',

    fontSize: 12,
    fontWeight: 400,
    lineHeight: '20px',
    color: cssVarV2.text.primary,
  },
]);

export const badges = style({
  display: 'flex',
  gap: 12,
  alignItems: 'center',
});

export const badge = style({
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '2px 8px',
  borderRadius: 40,
  backgroundColor: cssVarV2.layer.background.secondary,
  cursor: 'pointer',
  userSelect: 'none',
  position: 'relative',

  ':before': {
    content: '""',
    position: 'absolute',
    left: 0,
    top: 0,
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0,0,0,.04)',
    borderRadius: 'inherit',
    opacity: 0,
    transition: 'opacity 0.2s ease',
  },

  selectors: {
    '&:hover:before': {
      opacity: 1,
    },
    '&[data-active="true"]:before': {
      opacity: 1,
    },
  },
});

export const badgeIcon = style({
  fontSize: 20,
  lineHeight: 0,
  color: cssVarV2.icon.primary,
});

export const aiIcon = style({
  color: cssVarV2.icon.activated,
});

export const badgeText = style({
  fontSize: 15,
  lineHeight: '24px',
  whiteSpace: 'nowrap',
});
