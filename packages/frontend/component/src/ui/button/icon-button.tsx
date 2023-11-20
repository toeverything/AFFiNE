import clsx from 'clsx';
import type { HTMLAttributes, PropsWithChildren } from 'react';
import { forwardRef, type ReactElement } from 'react';

import { Loading } from '../loading';
import type { ButtonType } from './button';
import { iconButton } from './button.css';

export type IconButtonSize = 'default' | 'large' | 'small' | 'extraSmall';
export type IconButtonProps = Omit<HTMLAttributes<HTMLButtonElement>, 'type'> &
  PropsWithChildren<{
    type?: ButtonType;
    disabled?: boolean;
    size?: IconButtonSize;
    loading?: boolean;
    withoutPadding?: boolean;
    active?: boolean;
    withoutHoverStyle?: boolean;
    icon?: ReactElement;
  }>;

const defaultProps = {
  type: 'plain',
  disabled: false,
  size: 'default',
  loading: false,
  withoutPadding: false,
  active: false,
  withoutHoverStyle: false,
} as const;

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  (props, ref) => {
    const {
      type,
      size,
      withoutPadding,
      children,
      disabled,
      loading,
      active,
      withoutHoverStyle,
      icon: propsIcon,
      className,
      ...otherProps
    } = {
      ...defaultProps,
      ...props,
    };

    return (
      <button
        ref={ref}
        className={clsx(
          iconButton,
          {
            'without-padding': withoutPadding,

            primary: type === 'primary',
            plain: type === 'plain',
            error: type === 'error',
            warning: type === 'warning',
            success: type === 'success',
            processing: type === 'processing',

            large: size === 'large',
            small: size === 'small',
            'extra-small': size === 'extraSmall',

            disabled,
            loading,
            active,
            'without-hover': withoutHoverStyle,
          },
          className
        )}
        disabled={disabled}
        data-disabled={disabled}
        {...otherProps}
      >
        {loading ? <Loading /> : children || propsIcon}
      </button>
    );
  }
);

IconButton.displayName = 'IconButton';
export default IconButton;
