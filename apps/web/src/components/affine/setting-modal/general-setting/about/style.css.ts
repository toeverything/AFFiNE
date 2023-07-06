import { globalStyle, style } from '@vanilla-extract/css';

export const link = style({
  height: '18px',
  display: 'flex',
  alignItems: 'center',
  color: 'var(--affine-text-primary-color)',
  fontSize: 'var(--affine-font-sm)',
  fontWeight: 600,
  marginBottom: '12px',
  selectors: {
    '&:last-of-type': {
      marginBottom: '0',
    },
  },
});

globalStyle(`${link} .icon`, {
  color: 'var(--affine-icon-color)',
  fontSize: 'var(--affine-font-base)',
  marginLeft: '5px',
});

export const communityWrapper = style({
  display: 'grid',
  justifyContent: 'space-between',
  gridTemplateColumns: 'repeat(auto-fill, 70px)',
  gridGap: '6px',
});
export const communityItem = style({
  borderRadius: '8px',
  border: '1px solid var(--affine-border-color)',
  color: 'var(--affine-text-primary-color)',
  cursor: 'pointer',
  padding: '6px 8px',
});
globalStyle(`${communityItem} svg`, {
  width: '24px',
  height: '24px',
  display: 'block',
  margin: '0 auto 2px',
});
globalStyle(`${communityItem} p`, {
  fontSize: 'var(--affine-font-xs)',
  textAlign: 'center',
});
