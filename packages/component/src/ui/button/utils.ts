import type { Theme } from '@mui/material';

import type { ButtonProps } from './interface';
import { SIZE_DEFAULT, SIZE_MIDDLE, SIZE_SMALL } from './interface';

// TODO: Designer is not sure about the size, Now, is just use default size
export const SIZE_CONFIG = {
  [SIZE_SMALL]: {
    iconSize: 16,
    fontSize: 16,
    borderRadius: 6,
    height: 26,
    padding: 24,
  },
  [SIZE_MIDDLE]: {
    iconSize: 20,
    fontSize: 16,
    borderRadius: 6,
    height: 32,
    padding: 24,
  },
  [SIZE_DEFAULT]: {
    iconSize: 24,
    fontSize: 16,
    height: 38,
    padding: 24,
    borderRadius: 6,
  },
} as const;

export const getSize = (
  size: typeof SIZE_SMALL | typeof SIZE_MIDDLE | typeof SIZE_DEFAULT
) => {
  return SIZE_CONFIG[size];
};

export const getButtonColors = (
  theme: Theme,
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
        '.affine-button-icon': {
          color: 'var(--affine-white)',
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
