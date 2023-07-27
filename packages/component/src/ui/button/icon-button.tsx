import clsx from 'clsx';
import type { HTMLAttributes, PropsWithChildren } from 'react';
import { forwardRef, type ReactElement } from 'react';

import { Loading } from '../loading';
import type { ButtonType } from './button';
import { iconButton } from './style.css';

export type IconButtonSize = 'default' | 'large' | 'small' | 'extraSmall';
export type IconButtonProps = PropsWithChildren &
  Omit<HTMLAttributes<HTMLButtonElement>, 'type'> & {
    type?: ButtonType;
    disabled?: boolean;
    size?: IconButtonSize;
    loading?: boolean;
    withoutPadding?: boolean;
    active?: boolean;
    icon?: ReactElement;
  };
const defaultProps = {
  type: 'plain',
  disabled: false,
  size: 'default',
  loading: false,
  withoutPadding: false,
  active: false,
};

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
