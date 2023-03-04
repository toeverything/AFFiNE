import { Theme } from '@mui/material';

import {
  ButtonProps,
  SIZE_DEFAULT,
  SIZE_MIDDLE,
  SIZE_SMALL,
} from './interface';

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
        background: theme.colors.primaryColor,
        color: '#fff',
        borderColor: theme.colors.primaryColor,
        '.affine-button-icon': {
          color: '#fff',
        },
      };
    case 'light':
      return {
        background: theme.colors.hoverBackground,
        color: disabled ? theme.colors.disableColor : theme.colors.primaryColor,
        borderColor: theme.colors.hoverBackground,
        '.affine-button-icon': {
          borderColor: theme.colors.primaryColor,
        },
        ':hover': {
          borderColor: disabled
            ? theme.colors.hoverBackground
            : theme.colors.primaryColor,
        },
      };
    case 'warning':
      return {
        background: theme.colors.warningBackground,
        color: theme.colors.warningColor,
        borderColor: theme.colors.warningBackground,
        '.affine-button-icon': {
          color: theme.colors.warningColor,
        },
        ':hover': {
          borderColor: theme.colors.warningColor,
          color: extend?.hoverColor,
          background: extend?.hoverBackground,
          ...extend?.hoverStyle,
        },
      };
    case 'danger':
      return {
        background: theme.colors.errorBackground,
        color: theme.colors.errorColor,
        borderColor: theme.colors.errorBackground,
        '.affine-button-icon': {
          color: theme.colors.errorColor,
        },
        ':hover': {
          borderColor: theme.colors.errorColor,
          color: extend?.hoverColor,
          background: extend?.hoverBackground,
          ...extend?.hoverStyle,
        },
      };
    default:
      return {
        color: theme.colors.popoverColor,
        borderColor: theme.colors.borderColor,
        ':hover': {
          borderColor: theme.colors.primaryColor,
          color: extend?.hoverColor ?? theme.colors.primaryColor,
          '.affine-button-icon': {
            color: extend?.hoverColor ?? theme.colors.primaryColor,
            background: extend?.hoverBackground,
            ...extend?.hoverStyle,
          },
        },
      };
  }
};
