import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

const baseAction = style({
  display: 'flex',
  gap: 8,
  opacity: 0,
});

export const root = style({
  fontSize: cssVar('fontXs'),
  height: 20,
  width: 'calc(100%)',
  userSelect: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0 8px',
  borderRadius: 4,
  selectors: {
    [`&[data-collapsible="true"]`]: {
      cursor: 'pointer',
    },
    [`&[data-collapsible="true"]:hover`]: {
      backgroundColor: cssVarV2('layer/background/hoverOverlay'),
    },
    [`&[data-collapsible="true"]:hover:has(${baseAction}:hover)`]: {
      backgroundColor: 'transparent',
    },
  },
});

export const actions = style([
  baseAction,
  {
    selectors: {
      [`${root}:hover &`]: {
        opacity: 1,
      },
    },
  },
]);
export const label = style({
  color: cssVarV2('text/tertiary'),
  fontWeight: 500,
  lineHeight: '20px',
  flexGrow: '0',
  display: 'flex',
  gap: 2,
  alignItems: 'center',
  justifyContent: 'start',
  cursor: 'pointer',
});

export const collapseIcon = style({
  vars: { '--y': '1px', '--r': '90deg' },
  color: cssVarV2('icon/tertiary'),
  transform: 'translateY(var(--y)) rotate(var(--r))',
  transition: 'transform 0.2s',
  selectors: {
    [`${root}[data-collapsed="true"] &`]: {
      vars: { '--r': '0deg' },
    },
  },
});
