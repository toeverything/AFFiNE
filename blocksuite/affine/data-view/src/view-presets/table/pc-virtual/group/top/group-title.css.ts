import { cssVarV2 } from '@blocksuite/affine-shared/theme';
import { style } from '@vanilla-extract/css';

export const groupHeaderCount = style({
  flexShrink: 0,
  width: '20px',
  height: '20px',
  borderRadius: '4px',
  backgroundColor: 'var(--affine-background-secondary-color)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: cssVarV2.text.secondary,
  fontSize: 'var(--data-view-cell-text-size)',
});

export const groupHeaderName = style({
  flex: 1,
  overflow: 'hidden',
});

export const groupHeaderOps = style({
  display: 'flex',
  alignItems: 'center',
  opacity: 0,
  selectors: {
    '&:has(.active)': {
      opacity: 1,
    },
  },
});

export const show = style({
  opacity: 1,
});

export const groupHeaderOp = style({
  display: 'flex',
  alignItems: 'center',
  cursor: 'pointer',
  padding: '4px',
  borderRadius: '4px',
  transition: 'all 150ms cubic-bezier(0.42, 0, 1, 1)',
  color: cssVarV2.icon.primary,
  selectors: {
    '&:hover, &.active': {
      backgroundColor: cssVarV2.layer.background.hoverOverlay,
    },
  },
});

export const groupHeaderIcon = style({
  display: 'flex',
  alignItems: 'center',
  marginRight: '-4px',
  color: cssVarV2.icon.primary,
  fontSize: '16px',
});

export const groupHeaderTitle = style({
  color: cssVarV2.text.primary,
  fontSize: 'var(--data-view-cell-text-size)',
  marginLeft: '4px',
});

export const groupTitleRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  overflow: 'hidden',
  height: '22px',
});
