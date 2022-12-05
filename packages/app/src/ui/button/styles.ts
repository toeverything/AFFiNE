import { absoluteCenter, displayFlex, styled } from '@/styles';
import { CSSProperties } from 'react';

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
      ...displayFlex('center', 'center'),
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
