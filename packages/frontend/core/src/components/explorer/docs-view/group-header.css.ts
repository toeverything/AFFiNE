import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const groupHeader = style({
  width: '100%',
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  position: 'relative',
  padding: '0px 4px',
  borderRadius: 4,
  ':hover': {
    background: cssVarV2.layer.background.hoverOverlay,
  },
});
export const space = style({
  width: 0,
  flex: 1,
});
export const plainTextGroupHeaderIcon = style({
  width: 24,
  height: 24,
  fontSize: 20,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
});
export const plainTextGroupHeader = style({
  gap: 4,
  display: 'flex',
  alignItems: 'center',
  paddingLeft: 4,
  selectors: {
    [`&:has(${plainTextGroupHeaderIcon})`]: {
      paddingLeft: 0,
    },
  },
});

const showOnHover = style({
  opacity: 0,
  selectors: {
    [`${groupHeader}:hover &`]: {
      opacity: 1,
    },
  },
});

export const collapseButton = style([
  showOnHover,
  {
    width: 20,
    height: 20,
    marginLeft: 2,
    fontSize: 16,
    flexShrink: 0,
    color: cssVarV2.icon.primary,
  },
]);
export const collapseButtonIcon = style({
  vars: {
    '--rotate': '90deg',
  },
  transition: 'transform 0.23s cubic-bezier(.56,.15,.37,.97)',
  transform: 'rotate(var(--rotate))',
  selectors: {
    [`${groupHeader}[data-collapsed="true"] &`]: {
      vars: {
        '--rotate': '0deg',
      },
    },
  },
});

export const selectInfo = style({
  fontSize: 14,
  lineHeight: '22px',
  color: cssVarV2.text.tertiary,
  marginLeft: 12,
});

export const content = style({
  flexShrink: 0,
  fontSize: 15,
  lineHeight: '24px',
  color: cssVarV2.text.secondary,
});

export const selectAllButton = style([
  showOnHover,
  {
    padding: '0px 4px',
    fontSize: 12,
    lineHeight: '20px',
    color: cssVarV2.text.secondary,
    borderRadius: 4,
  },
]);
