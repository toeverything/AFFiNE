import type { Theme } from '@mui/material';

import type { ButtonProps } from './interface';

export const getButtonColors = (
  _theme: Theme,
  type: ButtonProps['type'],
  disabled: boolean,
  extend?: {
    hoverBackground: ButtonProps['hoverBackground'];
    hoverColor: ButtonProps['hoverColor'];
    hoverStyle: ButtonProps['hoverStyle'];
  }
) => {
  switch (type) {
    case 'primary':
      return {
        background: 'var(--affine-primary-color)',
        color: 'var(--affine-white)',
        borderColor: 'var(--affine-primary-color)',
        backgroundBlendMode: 'overlay',
        opacity: disabled ? '.4' : '1',
        '.affine-button-icon': {
          color: 'var(--affine-white)',
        },
        ':hover': {
          background:
            'linear-gradient(var(--affine-primary-color),var(--affine-primary-color)),var(--affine-hover-color)',
        },
      };
    case 'light':
      return {
        background: 'var(--affine-tertiary-color)',
        color: disabled
          ? 'var(--affine-text-disable-color)'
          : 'var(--affine-text-emphasis-color)',
        borderColor: 'var(--affine-tertiary-color)',
        '.affine-button-icon': {
          borderColor: 'var(--affine-text-emphasis-color)',
        },
        ':hover': {
          borderColor: disabled
            ? 'var(--affine-disable-color)'
            : 'var(--affine-text-emphasis-color)',
        },
      };
    case 'warning':
      return {
        background: 'var(--affine-background-warning-color)',
        color: 'var(--affine-warning-color)',
        borderColor: 'var(--affine-background-warning-color)',
        '.affine-button-icon': {
          color: 'var(--affine-warning-color)',
        },
        ':hover': {
          borderColor: 'var(--affine-warning-color)',
          color: extend?.hoverColor,
          background: extend?.hoverBackground,
          ...extend?.hoverStyle,
        },
      };
    case 'danger':
      return {
        background: 'var(--affine-background-error-color)',
        color: 'var(--affine-error-color)',
        borderColor: 'var(--affine-background-error-color)',
        '.affine-button-icon': {
          color: 'var(--affine-error-color)',
        },
        ':hover': {
          borderColor: 'var(--affine-error-color)',
          color: extend?.hoverColor,
          background: extend?.hoverBackground,
          ...extend?.hoverStyle,
        },
      };
    default:
      return {
        color: 'var(--affine-text-primary-color)',
        borderColor: 'var(--affine-border-color)',
        ':hover': {
          borderColor: 'var(--affine-primary-color)',
          color: extend?.hoverColor ?? 'var(--affine-primary-color)',
          '.affine-button-icon': {
            color: extend?.hoverColor ?? 'var(--affine-primary-color)',
            background: extend?.hoverBackground,
            ...extend?.hoverStyle,
          },
        },
      };
  }
};
