import { Children, cloneElement, forwardRef } from 'react';

import { ButtonProps } from './interface';
import { StyledTextButton } from './styles';
import { getSize } from './utils';
export const TextButton = forwardRef<HTMLButtonElement, ButtonProps>(
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
      <StyledTextButton
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
      </StyledTextButton>
    );
  }
);
TextButton.displayName = 'TextButton';

export default TextButton;
