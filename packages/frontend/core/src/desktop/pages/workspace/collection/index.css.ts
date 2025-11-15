import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const scrollArea = style({
  width: '100%',
  flexGrow: 1,
  height: 0,
});

export const collectionHeader = style({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '24px',
});

export const breadcrumb = style({
  fontSize: 14,
  lineHeight: '22px',
  color: cssVarV2.text.secondary,
  display: 'flex',
  alignItems: 'center',
});
export const breadcrumbItem = style({
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  cursor: 'pointer',
  selectors: {
    '&[data-active="true"]': {
      color: cssVarV2.text.primary,
      cursor: 'default',
    },
  },
});
export const breadcrumbLink = style({
  color: 'inherit',
  textDecoration: 'none',
});
export const breadcrumbIcon = style({
  fontSize: 20,
  color: cssVarV2.icon.primary,
});
export const breadcrumbSeparator = style({
  marginLeft: 4,
  marginRight: 8,
});

export const headerActions = style({
  display: 'flex',
  alignItems: 'center',
  gap: 16,
});

export const newPageButtonText = style({
  fontSize: 12,
  lineHeight: '20px',
  fontWeight: 500,
});
