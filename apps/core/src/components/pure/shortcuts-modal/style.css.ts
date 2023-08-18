import { globalStyle, style } from '@vanilla-extract/css';

export const shortcutsModal = style({
  width: '288px',
  height: '74vh',
  paddingBottom: '28px',
  backgroundColor: 'var(--affine-white)',
  boxShadow: 'var(--affine-popover-shadow)',
  borderRadius: `var(--affine-popover-radius)`,
  overflow: 'auto',
  position: 'fixed',
  right: '12px',
  top: '0',
  bottom: '0',
  margin: 'auto',
  zIndex: 'var(--affine-z-index-modal)',
});
// export const shortcutsModal = style({
//   color: 'var(--affine-text-primary-color)',
//   fontWeight: '500',
//   fontSize: 'var(--affine-font-sm)',
//   height: '44px',
//   display: 'flex',
//   justifyContent: 'center',
//   alignItems: 'center',
//   svg: {
//     width: '20px',
//     marginRight: '14px',
//     color: 'var(--affine-primary-color)',
//   },
// });
export const title = style({
  color: 'var(--affine-text-primary-color)',
  fontWeight: '500',
  fontSize: 'var(--affine-font-sm)',
  height: '44px',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
});

globalStyle(`${title} svg`, {
  width: '20px',
  marginRight: '14px',
  color: 'var(--affine-primary-color)',
});

export const subtitle = style({
  fontWeight: '500',
  fontSize: 'var(--affine-font-sm)',
  height: '34px',
  lineHeight: '36px',
  marginTop: '28px',
  padding: '0 16px',
});
export const modalHeader = style({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  paddingTop: '8px 4px 0 4px',
  width: '100%',
  padding: '8px 16px 0 16px',
  position: 'sticky',
  left: '0',
  top: '0',
  background: 'var(--affine-white)',
  transition: 'background-color 0.5s',
});

export const listItem = style({
  height: '34px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  fontSize: 'var(--affine-font-sm)',
  padding: '0 16px',
});
export const keyContainer = style({
  display: 'flex',
});

export const key = style({
  selectors: {
    '&:not(:last-child)::after': {
      content: '+',
      margin: '0 4px',
    },
  },
});
