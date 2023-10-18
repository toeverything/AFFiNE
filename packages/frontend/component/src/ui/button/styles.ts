import { displayInlineFlex, styled } from '../../styles';
import type { ButtonProps } from './interface';
import { getButtonColors, getSize } from './utils';

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
>(({
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
    WebkitAppRegion: 'no-drag',
    ...displayInlineFlex('center', 'center'),
    gap: '8px',
    position: 'relative',
    // TODO: disabled color is not decided
    ...(disabled
      ? {
          cursor: 'not-allowed',
          pointerEvents: 'none',
          color: 'var(--affine-text-disable-color)',
        }
      : {}),
    // TODO: Implement circle shape
    borderRadius: shape === 'default' ? borderRadius : height / 2,
    fontSize,
    fontWeight: bold ? '500' : '400',
    '.affine-button-icon': {
      color: 'var(--affine-icon-color)',
    },
    '.affine-button-icon__fixed': {
      color: 'var(--affine-icon-color)',
    },
    '>span': {
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
    //   color: hoverColor ?? 'var(--affine-primary-color)',
    //   background: hoverBackground ?? 'var(--affine-hover-color)',
    //   '.affine-button-icon':{
    //
    //   }
    //   ...(hoverStyle ?? {}),
    // },
  };
});
