import { style } from '@vanilla-extract/css';

export const inviteModalTitle = style({
  fontWeight: '600',
  fontSize: 'var(--affine-font-h-6)',
  marginBottom: '20px',
});

export const inviteModalContent = style({
  marginBottom: '40px',
});

export const inviteModalButtonContainer = style({
  display: 'flex',
  justifyContent: 'flex-end',
});
