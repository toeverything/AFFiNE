import { style } from '@vanilla-extract/css';

export const plansLayoutRoot = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '24px',
});

export const scrollArea = style({
  marginLeft: 'calc(-1 * var(--setting-modal-gap-x))',
  paddingLeft: 'var(--setting-modal-gap-x)',
  width: 'var(--setting-modal-width)',
  overflowX: 'auto',
  scrollSnapType: 'x mandatory',
  paddingBottom: '21px',

  '::-webkit-scrollbar': {
    display: 'block',
    height: '5px',
    background: 'transparent',
  },
  '::-webkit-scrollbar-thumb': {
    background: 'var(--affine-icon-secondary)',
    borderRadius: '5px',
  },
});

export const allPlansLink = style({
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  color: 'var(--affine-link-color)',
  background: 'transparent',
  borderColor: 'transparent',
  fontSize: 'var(--affine-font-xs)',
});
