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
    '&.disabled': {
      position: 'relative',
    },
    '&.disabled::after': {
      content: '',
      position: 'absolute',
      left: 0,
      top: 0,
      width: '100%',
      height: '100%',
      backgroundColor: 'rgba(255,255,255,0.5)',
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

export const storageProgressContainer = style({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
});

export const storageProgressWrapper = style({
  flexGrow: 1,
  marginRight: '20px',
});

globalStyle(`${storageProgressWrapper} .storage-progress-desc`, {
  fontSize: 'var(--affine-font-xs)',
  color: 'var(--affine-text-secondary-color)',
  height: '20px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 2,
});
globalStyle(`${storageProgressWrapper} .storage-progress-bar-wrapper`, {
  height: '8px',
  borderRadius: '4px',
  backgroundColor: 'var(--affine-pure-black-10)',
  overflow: 'hidden',
});
export const storageProgressBar = style({
  height: '100%',
  backgroundColor: 'var(--affine-processing-color)',
  selectors: {
    '&.warning': {
      // Wait for design
      backgroundColor: '#FF7C09',
    },
    '&.danger': {
      backgroundColor: 'var(--affine-error-color)',
    },
  },
});
export const storageExtendHint = style({
  borderRadius: '4px',
  padding: '4px 8px',
  backgroundColor: 'var(--affine-background-secondary-color)',
  color: 'var(--affine-text-secondary-color)',
  fontSize: 'var(--affine-font-xs)',
  lineHeight: '20px',
  marginTop: 8,
});
globalStyle(`${storageExtendHint} a`, {
  color: 'var(--affine-link-color)',
});
