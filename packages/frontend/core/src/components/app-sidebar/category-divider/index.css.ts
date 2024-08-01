import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const actions = style({
  display: 'flex',
  gap: 8,
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
    [`&[data-collapsible="true"]:hover:has(${actions}:hover)`]: {
      backgroundColor: 'transparent',
    },
  },
});
export const label = style({
  color: cssVarV2('text/tertiary'),
  fontWeight: 500,
  lineHeight: '20px',
  flexGrow: '0',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'start',
  cursor: 'pointer',
});

export const collapseButton = style({
  selectors: {
    [`${label} > &`]: {
      color: cssVarV2('icon/tertiary'),
      transform: 'translateY(1px)',
    },
  },
});
export const collapseIcon = style({
  transform: 'rotate(90deg)',
  transition: 'transform 0.2s',
  selectors: {
    [`${root}[data-collapsed="true"] &`]: {
      transform: 'rotate(0deg)',
    },
  },
});
