import { style } from '@vanilla-extract/css';

export const workspaceListWrapper = style({
  display: 'flex',
  width: '100%',
  flexDirection: 'column',
});

export const signInWrapper = style({
  display: 'flex',
  width: '100%',
  gap: '12px',
  alignItems: 'center',
  justifyContent: 'flex-start',
  borderRadius: '8px',
});

export const iconContainer = style({
  width: '28px',
  padding: '2px 4px 4px',
  borderRadius: '14px',
  background: 'var(--affine-white)',
  display: 'flex',
  border: '1px solid var(--affine-icon-secondary)',
  color: 'var(--affine-icon-secondary)',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '20px',
});

export const signInTextContainer = style({
  display: 'flex',
  flexDirection: 'column',
});

export const signInTextPrimary = style({
  fontSize: 'var(--affine-font-sm)',
  fontWeight: 600,
  lineHeight: '22px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const signInTextSecondary = style({
  fontSize: 'var(--affine-font-xs)',
  fontWeight: 400,
  lineHeight: '20px',
  color: 'var(--affine-text-secondary-color)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const menuItem = style({
  borderRadius: '8px',
});
