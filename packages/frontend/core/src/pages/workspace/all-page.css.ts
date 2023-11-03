import { style } from '@vanilla-extract/css';

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
  height: 100,
  alignItems: 'center',
  padding: '48px 16px 20px 24px',
  overflow: 'hidden',
  display: 'flex',
  justifyContent: 'space-between',
  background: 'var(--affine-background-primary-color)',
});

export const allPagesHeaderTitle = style({
  fontSize: 'var(--affine-font-h-5)',
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

export const headerCreateNewButton = style({
  transition: 'opacity 0.1s ease-in-out',
});

export const newPageButtonLabel = style({
  display: 'flex',
  alignItems: 'center',
});

export const headerCreateNewButtonHidden = style({
  opacity: 0,
});
