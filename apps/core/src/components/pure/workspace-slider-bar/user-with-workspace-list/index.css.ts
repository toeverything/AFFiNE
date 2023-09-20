import { style } from '@vanilla-extract/css';

export const WorkspaceListWrapper = style({
  display: 'flex',
  width: '100%',
  flexDirection: 'column',
});

export const SignInWrapper = style({
  display: 'flex',
  width: '100%',
  gap: '12px',
  alignItems: 'center',
  justifyContent: 'flex-start',
  borderRadius: '8px',
});

export const IconContainer = style({
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

export const SignInTextContainer = style({
  display: 'flex',
  flexDirection: 'column',
});

export const SignInTextPrimary = style({
  fontSize: 'var(--affine-font-sm)',
  fontWeight: 600,
  lineHeight: '22px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const SignInTextSecondary = style({
  fontSize: 'var(--affine-font-xs)',
  fontWeight: 400,
  lineHeight: '20px',
  color: 'var(--affine-text-secondary-color)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});
