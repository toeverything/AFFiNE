import clsx from 'clsx';
import type { FC, HTMLAttributes, PropsWithChildren } from 'react';

import { Loading } from '../loading';
import type { ButtonType } from './button-new';
import { iconButton } from './style.css';

export type IconButtonSize = 'default' | 'large' | 'small' | 'extraSmall';
export type IconButtonProps = PropsWithChildren &
  Omit<HTMLAttributes<HTMLButtonElement>, 'type'> & {
    type?: ButtonType;
    disabled?: boolean;
    size?: IconButtonSize;
    loading?: boolean;
    withoutPadding?: boolean;
  };
const defaultProps = {
  type: 'plain',
  disabled: false,
  size: 'default',
  loading: false,
  withoutPadding: false,
};

export const IconButton: FC<IconButtonProps> = props => {
  const { type, size, withoutPadding, children, disabled, loading } = {
    ...defaultProps,
    ...props,
  };

  return (
    <button
      className={clsx(iconButton, {
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
      })}
    >
      {loading ? <Loading /> : children}
    </button>
  );
};
