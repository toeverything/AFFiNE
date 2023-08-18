import { globalStyle, style } from '@vanilla-extract/css';

export const settingHeader = style({
  height: '68px',
  borderBottom: '1px solid var(--affine-border-color)',
  marginBottom: '24px',
});

globalStyle(`${settingHeader} .title`, {
  fontSize: 'var(--affine-font-base)',
  fontWeight: 600,
  lineHeight: '24px',
  marginBottom: '4px',
});

globalStyle(`${settingHeader} .subtitle`, {
  fontSize: 'var(--affine-font-xs)',
  lineHeight: '16px',
  color: 'var(--affine-text-secondary-color)',
});

export const wrapper = style({
  borderBottom: '1px solid var(--affine-border-color)',
  paddingBottom: '24px',
  marginBottom: '24px',
  selectors: {
    '&:last-of-type': {
      borderBottom: 'none',
      paddingBottom: '0',
      marginBottom: '0',
    },
  },
});

globalStyle(`${wrapper} .title`, {
  fontSize: 'var(--affine-font-sm)',
  fontWeight: 600,
  lineHeight: '18px',
  color: 'var(--affine-text-secondary-color)',
  marginBottom: '16px',
});

export const settingRow = style({
  marginBottom: '25px',
  color: 'var(--affine-text-primary-color)',
  borderRadius: '8px',
  selectors: {
    '&.two-col': {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    '&:last-of-type': {
      marginBottom: '0',
    },
  },
});

globalStyle(`${settingRow} .left-col`, {
  flex: 1,
  maxWidth: '100%',
});
globalStyle(`${settingRow}.two-col .left-col`, {
  flexShrink: 0,
  maxWidth: '80%',
});
globalStyle(`${settingRow} .name`, {
  marginBottom: '2px',
  fontSize: 'var(--affine-font-sm)',
  fontWeight: 600,
});
globalStyle(`${settingRow} .desc`, {
  fontSize: 'var(--affine-font-xs)',
  color: 'var(--affine-text-secondary-color)',
});
globalStyle(`${settingRow} .right-col`, {
  width: '250px',
  display: 'flex',
  justifyContent: 'flex-end',
  paddingLeft: '15px',
  flexShrink: 0,
});
