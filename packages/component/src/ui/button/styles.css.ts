import { style } from '@vanilla-extract/css';

export const dropdownBtn = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 10px',
  // fix dropdown button click area
  paddingRight: 0,
  color: 'var(--affine-text-primary-color)',
  fontWeight: 600,
  background: 'var(--affine-button-gray-color)',
  boxShadow: 'var(--affine-float-button-shadow)',
  borderRadius: '8px',
  fontSize: 'var(--affine-font-sm)',
  // width: '100%',
  height: '32px',
  userSelect: 'none',
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  selectors: {
    '&:hover': {
      background: 'var(--affine-hover-color)',
    },
  },
});

export const divider = style({
  width: '0.5px',
  height: '16px',
  background: 'var(--affine-border-color)',
  // fix dropdown button click area
  margin: '0 4px',
  marginRight: 0,
});

export const dropdownWrapper = style({
  width: '100%',
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  paddingLeft: '4px',
  paddingRight: '10px',
});

export const icon = style({
  borderRadius: '4px',
  selectors: {
    '&:hover': {
      background: 'var(--affine-hover-color)',
    },
  },
});

export const radioButton = style({
  fontSize: 'var(--affine-font-xs)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  width: '75px',
  height: '24px',
  borderRadius: '8px',
  filter: 'drop-shadow(0px 0px 4px rgba(0, 0, 0, 0.1))',
  whiteSpace: 'nowrap',
  userSelect: 'none',
  selectors: {
    '&:hover': {
      background: 'var(--affine-hover-color)',
    },
    '&[data-state="checked"]': {
      background: 'var(--affine-white)',
    },
  },
});

export const radioUncheckedButton = style([
  radioButton,
  {
    selectors: {
      '[data-state="checked"] > &': {
        display: 'none',
      },
    },
  },
]);

export const radioButtonGroup = style({
  display: 'inline-flex',
  alignItems: 'flex-start',
  background: 'var(--affine-hover-color)',
  borderRadius: '10px',
  padding: '2px',
});
