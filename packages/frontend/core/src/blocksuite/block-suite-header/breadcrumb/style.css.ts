import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const breadcrumb = style({
  display: 'flex',
  alignItems: 'center',
  minWidth: 0,
  flexShrink: 1,
  // the header already has a gap, keep the trailing separator close to the title
  marginRight: -8,
  fontSize: 14,
  lineHeight: '22px',
  color: cssVarV2('text/secondary'),
  '@container': {
    'detail-page-header (width <= 600px)': {
      display: 'none',
    },
  },
});

export const item = style({
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  minWidth: 0,
  maxWidth: 160,
  padding: '0 4px',
  borderRadius: 4,
  color: 'inherit',
  textDecoration: 'none',
  cursor: 'pointer',
  selectors: {
    '&:hover': {
      backgroundColor: cssVarV2('layer/background/hoverOverlay'),
      color: cssVarV2('text/primary'),
    },
  },
});

export const itemIcon = style({
  flexShrink: 0,
  fontSize: 16,
  color: cssVarV2('icon/primary'),
});

export const itemTitle = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const separator = style({
  flexShrink: 0,
  padding: '0 2px',
  color: cssVarV2('text/tertiary'),
});
