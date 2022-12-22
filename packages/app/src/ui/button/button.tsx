import {
  HTMLAttributes,
  cloneElement,
  ReactElement,
  Children,
  CSSProperties,
  forwardRef,
  PropsWithChildren,
} from 'react';
import { StyledButton } from './styles';

import { ButtonProps } from './interface';
import { getSize } from './utils';

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      size = 'default',
      disabled = false,
      hoverBackground,
      hoverColor,
      hoverStyle,
      shape = 'default',
      icon,
      type = 'default',
      children,
      bold = false,
      ...props
    },
    ref
  ) => {
    const { iconSize } = getSize(size);

    return (
      <StyledButton
        ref={ref}
        disabled={disabled}
        size={size}
        shape={shape}
        hoverBackground={hoverBackground}
        hoverColor={hoverColor}
        hoverStyle={hoverStyle}
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        type={type}
        bold={bold}
        {...props}
      >
        {icon &&
          cloneElement(Children.only(icon), {
            width: iconSize,
            height: iconSize,
            className: `affine-button-icon ${icon.props.className ?? ''}`,
          })}
        {children && <span>{children}</span>}
      </StyledButton>
    );
  }
);
Button.displayName = 'Button';

export default Button;
