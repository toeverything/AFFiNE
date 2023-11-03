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
});

export const scrollBar = style({
  display: 'flex',
  alignItems: 'center',
  userSelect: 'none',
  touchAction: 'none',
  height: '9px',
  width: '100%',
});

export const scrollThumb = style({
  background: 'var(--affine-icon-secondary)',
  opacity: 0.6,
  overflow: 'hidden',
  height: '4px',
  borderRadius: '4px',

  vars: {
    '--radix-scroll-area-thumb-height': '4px',
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
