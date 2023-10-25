import { keyframes, style } from '@vanilla-extract/css';

const headerScrollAnimation = keyframes({
  '0%': {
    opacity: 1,
  },
  '30%': {
    opacity: 0,
  },
  '100%': {
    opacity: 0,
  },
});

export const root = style({
  height: '100%',
  width: '100%',
  display: 'flex',
  flexFlow: 'column',
  background: 'var(--affine-background-primary-color)',
});

export const scrollContainer = style({
  flex: 1,
  width: '100%',
  paddingBottom: '32px',
});

export const allPagesHeader = style({
  padding: '48px 16px 20px 24px',
  overflow: 'hidden',
  display: 'flex',
  justifyContent: 'space-between',
  background: 'var(--affine-background-primary-color)',
  animationName: `${headerScrollAnimation}`,
  animationTimeline: '--list-scroll-root',
});

export const allPagesHeaderTitle = style({
  fontSize: 'var(--affine-font-h-3)',
  fontWeight: 500,
  color: 'var(--affine-text-secondary-color)',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
});

export const titleIcon = style({
  color: 'var(--affine-icon-color)',
  display: 'inline-flex',
  alignItems: 'center',
});

export const titleCollectionName = style({
  color: 'var(--affine-text-primary-color)',
});

export const floatingToolbar = style({
  position: 'absolute',
  bottom: 26,
  width: '100%',
  zIndex: 1,
});

export const toolbarSelectedNumber = style({
  color: 'var(--affine-text-secondary-color)',
});
