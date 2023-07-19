import { createVar, style } from '@vanilla-extract/css';

export const heightVar = createVar('heightVar');
export const widthVar = createVar('widthVar');

export const inputStyle = style({
  vars: {
    [heightVar]: 'unset',
    [widthVar]: '100%',
  },
  width: widthVar,
  height: heightVar,
  lineHeight: '22px',
  padding: '8px 12px',
  color: 'var(--affine-text-primary-color)',
  border: '1px solid',
  backgroundColor: 'var(--affine-white)',
  borderRadius: '10px',
  selectors: {
    '&[data-no-border="true"]': {
      border: 'unset',
    },
    '&[data-disabled="true"]': {
      color: 'var(--affine-text-disable-color)',
    },
    '&::placeholder': {
      color: 'var(--affine-placeholder-color)',
    },

    '&.error': {
      borderColor: 'var(--affine-error-color)',
    },
    '&.success': {
      borderColor: 'var(--affine-success-color)',
    },
    '&.warning': {
      borderColor: 'var(--affine-warning-color)',
    },
    '&.default': {
      borderColor: 'var(--affine-border-color)',
    },
    '&.default:focus': {
      borderColor: 'var(--affine-primary-color)',
    },
    '&.disable': {
      borderColor: 'var(--affine-disable-color)',
      color: 'var(--affine-text-disable-color)',
    },
  },
});
