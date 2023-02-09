import { cloneElement, Children, forwardRef } from 'react';
import { StyledButton } from './styles';

import { ButtonProps } from './interface';
import { getSize } from './utils';
import { Loading } from './Loading';

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
      iconPosition = 'start',
      type = 'default',
      children,
      bold = false,
      loading = false,
      noBorder = false,
      ...props
    },
    ref
  ) => {
    const { iconSize } = getSize(size);

    const iconElement =
      icon &&
      cloneElement(Children.only(icon), {
        width: iconSize,
        height: iconSize,
        className: `affine-button-icon ${icon.props.className ?? ''}`,
      });

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
        noBorder={noBorder}
        {...props}
      >
        {loading ? (
          <Loading type={type}></Loading>
        ) : (
          <>
            {iconPosition === 'start' && iconElement}
            {children && <span>{children}</span>}
            {iconPosition === 'end' && iconElement}
          </>
        )}
      </StyledButton>
    );
  }
);
Button.displayName = 'Button';

export default Button;
