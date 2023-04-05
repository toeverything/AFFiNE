import type { CSSProperties } from 'react';

import { absoluteCenter, displayInlineFlex, styled } from '../../styles';
import type { ButtonProps } from './interface';
import { getButtonColors, getSize } from './utils';

export const StyledIconButton = styled('button', {
  shouldForwardProp: prop => {
    return ![
      'borderRadius',
      'top',
      'right',
      'width',
      'height',
      'hoverBackground',
      'hoverColor',
      'hoverStyle',
      'fontSize',
    ].includes(prop as string);
  },
})<{
  width: number;
  height: number;
  borderRadius: number;
  disabled?: boolean;
  hoverBackground?: CSSProperties['background'];
  hoverColor?: string;
  hoverStyle?: CSSProperties;
  // In some cases, button is in a normal hover status, it should be darkened
  fontSize?: CSSProperties['fontSize'];
}>(
  ({
    theme,
    width,
    height,
    borderRadius,
    disabled,
    hoverBackground,
    hoverColor,
    hoverStyle,
    fontSize,
  }) => {
    return {
      width,
      height,
      fontSize,
      color: theme.colors.iconColor,
      ...displayInlineFlex('center', 'center'),
      position: 'relative',
      ...(disabled ? { cursor: 'not-allowed', pointerEvents: 'none' } : {}),
      transition: 'background .15s',

      // TODO: we need to add @emotion/babel-plugin
      '::after': {
        content: '""',
        width,
        height,
        borderRadius,
        transition: 'background .15s',
        ...absoluteCenter({ horizontal: true, vertical: true }),
      },

      svg: {
        position: 'relative',
        zIndex: 1,
      },

      ':hover': {
        color: hoverColor ?? theme.colors.primaryColor,
        '::after': {
          background: hoverBackground || theme.colors.hoverBackground,
        },
        ...(hoverStyle ?? {}),
      },
    };
  }
);

export const StyledTextButton = styled('button', {
  shouldForwardProp: prop => {
    return ![
      'borderRadius',
      'top',
      'right',
      'width',
      'height',
      'hoverBackground',
      'hoverColor',
      'hoverStyle',
      'bold',
    ].includes(prop as string);
  },
})<
  Pick<
    ButtonProps,
    | 'size'
    | 'disabled'
    | 'hoverBackground'
    | 'hoverColor'
    | 'hoverStyle'
    | 'shape'
    | 'type'
    | 'bold'
  >
>(
  ({
    theme,
    size = 'default',
    disabled,
    hoverBackground,
    hoverColor,
    hoverStyle,
    bold = false,
    shape = 'default',
    // TODO: Implement type
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    // type = 'default',
  }) => {
    const { fontSize, borderRadius, padding, height } = getSize(size);
    console.log('size', size, height);

    return {
      height,
      paddingLeft: padding,
      paddingRight: padding,
      ...displayInlineFlex('flex-start', 'center'),
      position: 'relative',
      ...(disabled ? { cursor: 'not-allowed', pointerEvents: 'none' } : {}),
      transition: 'background .15s',
      // TODO: Implement circle shape
      borderRadius: shape === 'default' ? borderRadius : height / 2,
      fontSize,
      fontWeight: bold ? '500' : '400',

      ':hover': {
        color: hoverColor ?? theme.colors.primaryColor,
        background: hoverBackground ?? theme.colors.hoverBackground,
        ...(hoverStyle ?? {}),
      },
    };
  }
);

export const StyledButton = styled('button', {
  shouldForwardProp: prop => {
    return ![
      'hoverBackground',
      'shape',
      'hoverColor',
      'hoverStyle',
      'type',
      'bold',
      'noBorder',
    ].includes(prop as string);
  },
})<
  Pick<
    ButtonProps,
    | 'size'
    | 'disabled'
    | 'hoverBackground'
    | 'hoverColor'
    | 'hoverStyle'
    | 'shape'
    | 'type'
    | 'bold'
    | 'noBorder'
  >
>(
  ({
    theme,
    size = 'default',
    disabled,
    hoverBackground,
    hoverColor,
    hoverStyle,
    bold = false,
    shape = 'default',
    type = 'default',
    noBorder = false,
  }) => {
    const { fontSize, borderRadius, padding, height } = getSize(size);

    return {
      height,
      paddingLeft: padding,
      paddingRight: padding,
      border: noBorder ? 'none' : '1px solid',
      ...displayInlineFlex('center', 'center'),
      position: 'relative',
      // TODO: disabled color is not decided
      ...(disabled
        ? {
            cursor: 'not-allowed',
            pointerEvents: 'none',
            color: theme.colors.disableColor,
          }
        : {}),
      transition: 'background .15s',
      // TODO: Implement circle shape
      borderRadius: shape === 'default' ? borderRadius : height / 2,
      fontSize,
      fontWeight: bold ? '500' : '400',
      '.affine-button-icon': {
        color: theme.colors.iconColor,
      },
      '.affine-button-icon__fixed': {
        color: theme.colors.iconColor,
      },
      '>span': {
        marginLeft: '5px',
        width: 'max-content',
      },
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      ...getButtonColors(theme, type, disabled, {
        hoverBackground,
        hoverColor,
        hoverStyle,
      }),

      // TODO: disabled hover should be implemented
      //
      // ':hover': {
      //   color: hoverColor ?? theme.colors.primaryColor,
      //   background: hoverBackground ?? theme.colors.hoverBackground,
      //   '.affine-button-icon':{
      //
      //   }
      //   ...(hoverStyle ?? {}),
      // },
    };
  }
);
