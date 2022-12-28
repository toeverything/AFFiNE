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
      type = 'default',
      children,
      bold = false,
      loading = false,
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
        {loading ? (
          <Loading type={type}></Loading>
        ) : (
          <>
            {icon &&
              cloneElement(Children.only(icon), {
                width: iconSize,
                height: iconSize,
                className: `affine-button-icon ${icon.props.className ?? ''}`,
              })}
            {children && <span>{children}</span>}
          </>
        )}
      </StyledButton>
    );
  }
);
Button.displayName = 'Button';

export default Button;
