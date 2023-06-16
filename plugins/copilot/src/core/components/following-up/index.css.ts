import { style } from '@vanilla-extract/css';

export const followingUpStyle = style({
  display: 'flex',
  flexDirection: 'row',
  flexWrap: 'wrap',
  gap: '10px',
  alignItems: 'flex-start',
  marginTop: '10px',
  marginBottom: '10px',
});

export const questionStyle = style({
  backgroundColor: 'var(--affine-white-90)',
  fontSize: 'var(--affine-font-xs)',
  border: '1px solid var(--affine-border-color)',
  borderRadius: '8px',
  padding: '6px 12px',
  cursor: 'pointer',
});
