import { assignInlineVars } from '@vanilla-extract/dynamic';
import clsx from 'clsx';
import {
  type CSSProperties,
  forwardRef,
  type ReactElement,
  type SVGAttributes,
} from 'react';

import { Button, type ButtonProps } from './button';
import { iconButton, iconSizeVar } from './button.css';

export interface IconButtonProps extends Omit<
  ButtonProps,
  | 'variant'
  | 'size'
  | 'prefix'
  | 'suffix'
  | 'children'
  | 'prefixClassName'
  | 'prefixStyle'
  | 'suffix'
  | 'suffixClassName'
  | 'suffixStyle'
> {
  /**  Icon element */
  children?: ReactElement<SVGAttributes<SVGElement>>;
  /** Same as `children`, compatibility of the old API */
  icon?: ReactElement<SVGAttributes<SVGElement>>;
  variant?: 'plain' | 'solid' | 'danger' | 'custom';
  /**
   * Use preset size,
   * or use custom size(px) (default padding is `2px`, have to override yourself)
   *
   * > These presets size are referenced from the design system.
   * > The number is the size of the icon, the button size is calculated based on the icon size + padding.
   * > OR, you can define `width` and `height` in `style` or `className` directly.
   */
  size?: '12' | '14' | '16' | '20' | '24' | number;
  iconClassName?: string;
  iconStyle?: CSSProperties;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      variant = 'plain',
      size = '20',
      style,
      className,
      children,
      icon,
      iconClassName,
      iconStyle,
      ...otherProps
    },
    ref
  ) => {
    const validatedSize = isNaN(parseInt(size as string, 10)) ? 16 : size;

    return (
      <Button
        ref={ref}
        style={{
          ...style,
          ...assignInlineVars({
            [iconSizeVar]: `${validatedSize}px`,
          }),
        }}
        data-icon-variant={variant}
        data-icon-size={validatedSize}
        className={clsx(iconButton, className)}
        size={'custom'}
        variant={'custom'}
        prefix={children ?? icon}
        prefixClassName={iconClassName}
        prefixStyle={iconStyle}
        {...otherProps}
      />
    );
  }
);

IconButton.displayName = 'IconButton';
export default IconButton;
