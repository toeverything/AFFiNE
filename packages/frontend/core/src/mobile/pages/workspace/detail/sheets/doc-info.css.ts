import { rowHPadding } from '@affine/core/components/affine/page-properties/styles.css';
import { style } from '@vanilla-extract/css';

export const viewport = style({
  vars: {
    [rowHPadding]: '0px',
  },
});

export const item = style({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 4,
  height: 34,
  padding: '0 20px',

  fontSize: 17,
  lineHeight: '22px',
  fontWeight: 400,
  letterSpacing: -0.43,
});

export const linksRow = style({
  padding: '0 16px',
});

export const timeRow = style({
  padding: '0 16px',
});

export const tagsRow = style({
  padding: '0 16px',
});

export const properties = style({
  padding: '0 16px',
});

export const scrollBar = style({
  width: 6,
  transform: 'translateX(-4px)',
});

export const rowNameContainer = style({
  display: 'flex',
  flexDirection: 'row',
  gap: 6,
  padding: 6,
  width: '160px',
});
