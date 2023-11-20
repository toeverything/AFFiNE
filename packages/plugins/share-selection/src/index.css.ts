import { style } from '@vanilla-extract/css';

export const shareSelectionBarStyle = style({
  height: '100%',
  borderLeft: `1px solid var(--affine-border-color)`,
});

export const headerStyle = style({
  width: '100%',
  textAlign: 'center',
  marginTop: '8px',
});

export const textareaStyle = style({
  width: '100%',
  height: '200px',
  border: '1px solid var(--affine-border-color)',
  borderRadius: '4px',
  overflow: 'auto',
  margin: '8px',
});

export const sharingBarButtonStyle = style({
  width: '80px',
  height: '30px',
  borderRadius: '4px',
  border: '1px solid var(--affine-border-color)',
  margin: '8px',
  ':hover': {
    cursor: 'pointer',
    backgroundColor: 'var(--affine-hover-color)',
  },
});

  