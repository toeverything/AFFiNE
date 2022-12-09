import { absoluteCenter, displayInlineFlex, styled } from '@/styles';
import { CSSProperties } from 'react';
import { ButtonProps } from '@/ui/button/interface';
import { getSize, getButtonColors } from './utils';

export const StyledIconButton = styled.button<{
  width: number;
  height: number;
  borderRadius: number;
  disabled?: boolean;
  hoverBackground?: string;
  hoverColor?: string;
  hoverStyle?: CSSProperties;
}>(
  ({
    theme,
    width,
    height,
    disabled,
    hoverBackground,
    hoverColor,
    hoverStyle,
  }) => {
    return {
      width,
      height,
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
        borderRadius: width / 5,
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
          background: hoverBackground ?? theme.colors.hoverBackground,
        },
        ...(hoverStyle ?? {}),
      },
    };
  }
);
export const StyledButton = styled.button<
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
    type = 'default',
  }) => {
    const { fontSize, borderRadius, padding, height } = getSize(size);

    return {
      height,
      paddingLeft: padding,
      paddingRight: padding,
      border: '1px solid',
      ...displayInlineFlex('flex-start', 'center'),
      position: 'relative',
      ...(disabled ? { cursor: 'not-allowed', pointerEvents: 'none' } : {}),
      transition: 'background .15s',
      // TODO: Implement circle shape
      borderRadius: shape === 'default' ? borderRadius : height / 2,
      fontSize,
      fontWeight: bold ? '500' : '400',
      '.affine-button-icon': {
        color: theme.colors.iconColor,
      },
      '>span': {
        marginLeft: '5px',
      },
      // @ts-ignore
      ...getButtonColors(theme, type, {
        hoverBackground,
        hoverColor,
        hoverStyle,
      }),

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
