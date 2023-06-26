import { globalStyle, style } from '@vanilla-extract/css';

export const shortcutRow = style({
  height: '32px',
  marginBottom: '12px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  fontSize: 'var(--affine-font-base)',
  selectors: {
    '&:last-of-type': {
      marginBottom: '0',
    },
  },
});

globalStyle(`${shortcutRow} .shortcut`, {
  border: '1px solid var(--affine-border-color)',
  borderRadius: '8px',
  padding: '4px 18px',
});
