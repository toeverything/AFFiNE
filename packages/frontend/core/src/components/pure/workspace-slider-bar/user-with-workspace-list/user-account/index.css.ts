import { style } from '@vanilla-extract/css';

export const userAccountContainer = style({
  display: 'flex',
  padding: '4px 0px 4px 12px',
  gap: '12px',
  alignItems: 'center',
  justifyContent: 'space-between',
});
export const userEmail = style({
  fontSize: 'var(--affine-font-sm)',
  fontWeight: 400,
  lineHeight: '22px',
  textOverflow: 'ellipsis',
  overflow: 'hidden',
  whiteSpace: 'nowrap',
  maxWidth: 'calc(100% - 36px)',
});
