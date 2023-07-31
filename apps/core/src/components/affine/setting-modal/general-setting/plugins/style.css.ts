import { style } from '@vanilla-extract/css';

export const settingWrapper = style({
  flexGrow: 1,
  display: 'flex',
  justifyContent: 'flex-end',
  minWidth: '150px',
  maxWidth: '250px',
});

export const pluginItem = style({
  borderBottom: '1px solid var(--affine-border-color)',
  transition: '0.3s',
  padding: '24px 8px',
  fontSize: 'var(--affine-font-sm)',
});
