import { style } from '@vanilla-extract/css';

export const wrapper = style({
  flexGrow: '1',
  height: '100%',

  // margin: '0 auto',
  padding: '40px 15px 20px 15px',
  overflowX: 'hidden',
  overflowY: 'auto',

  display: 'flex',
  justifyContent: 'center',

  '::-webkit-scrollbar': {
    display: 'none',
  },
});

export const centerContainer = style({
  width: '100%',
  maxWidth: '560px',
});

export const content = style({
  width: '100%',
  marginBottom: '24px',
});

export const suggestionLink = style({
  fontSize: 'var(--affine-font-sm)',
  color: 'var(--affine-text-primary-color)',
  display: 'flex',
  alignItems: 'center',
});

export const suggestionLinkIcon = style({
  color: 'var(--affine-icon-color)',
  marginRight: '12px',
  display: 'flex',
});
