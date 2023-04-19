import { style } from '@vanilla-extract/css';

export const dialogOverlayStyle = style({
  backgroundColor: 'var(--affine-background-modal-color)',
  position: 'fixed',
  inset: 0,
  animation: 'overlayShow 150ms cubic-bezier(0.16, 1, 0.3, 1)',
});

export const dialogContentStyle = style({
  backgroundColor: 'var(--affine-background-primary-color)',
  borderRadius: '4px',
  position: 'fixed',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: '100%',
  maxWidth: '600px',
  padding: '24px',
  animation: 'contentShow 150ms cubic-bezier(0.16, 1, 0.3, 1)',
});

export const buttonStyle = style({
  backgroundColor: 'var(--affine-primary-color)',
  color: 'var(--affine-white)',
});
