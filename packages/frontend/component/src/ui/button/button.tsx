import clsx from 'clsx';
import type {
  CSSProperties,
  HTMLAttributes,
  MouseEvent,
  ReactElement,
  SVGAttributes,
} from 'react';
import { cloneElement, forwardRef, useCallback, useMemo } from 'react';

import { useAutoFocus } from '../../hooks';
import { Loading } from '../loading';
import { Tooltip, type TooltipProps } from '../tooltip';
import * as styles from './button.css';

export type ButtonType =
  | 'primary'
  | 'secondary'
  | 'plain'
  | 'error'
  | 'success'
  | 'custom';
export type ButtonSize = 'default' | 'large' | 'extraLarge' | 'custom';

export interface ButtonProps
  extends Omit<HTMLAttributes<HTMLButtonElement>, 'type' | 'prefix'> {
  /**
   * Preset color scheme
   * @default 'secondary'
   */
  variant?: ButtonType;
  disabled?: boolean;
  /**
   * By default, the button is `inline-flex`, set to `true` to make it `flex`
   * @default false
   */
  block?: boolean;
  /**
   * Preset size, will be overridden by `style` or `className`
   * @default 'default'
   */
  size?: ButtonSize;
  /**
   * Will show a loading spinner at `prefix` position
   */
  loading?: boolean;

  /** No hover state */
  withoutHover?: boolean;

  /**
   * By default, it is considered as an icon with preset size and color,
   * can be overridden by `prefixClassName` and `prefixStyle`.
   *
   * If `loading` is true, will be replaced by a spinner.(`prefixClassName` and `prefixStyle` still work)
   * */
  prefix?: ReactElement<SVGAttributes<SVGElement>>;
  prefixClassName?: string;
  prefixStyle?: CSSProperties;
  contentClassName?: string;
  contentStyle?: CSSProperties;

  /**
   * By default, it is considered as an icon with preset size and color,
   * can be overridden by `suffixClassName` and `suffixStyle`.
   * */
  suffix?: ReactElement<SVGAttributes<SVGElement>>;
  suffixClassName?: string;
  suffixStyle?: CSSProperties;

  tooltip?: TooltipProps['content'];
  tooltipShortcut?: TooltipProps['shortcut'];
  tooltipOptions?: Partial<Omit<TooltipProps, 'content' | 'shortcut'>>;
  [key: `data-${string}`]: string;
}

const IconSlot = ({
  icon,
  loading,
  className,
  variant,
  ...attrs
}: {
  icon?: ReactElement<SVGAttributes<SVGElement>>;
  loading?: boolean;
  variant?: ButtonType;
} & HTMLAttributes<HTMLElement>) => {
  const showLoadingHere = loading !== undefined;
  const visible = icon || loading;

  const loadingStrokeColor = useMemo(() => {
    const usePureWhite =
      variant &&
      (['primary', 'error', 'success'] as ButtonType[]).includes(variant);
    return usePureWhite ? '#fff' : undefined;
  }, [variant]);

  return visible ? (
    <div className={clsx(styles.icon, className)} {...attrs}>
      {showLoadingHere && loading ? (
        <Loading size="100%" strokeColor={loadingStrokeColor} />
      ) : null}
      {icon && !loading
        ? cloneElement(icon, {
            width: '100%',
            height: '100%',
            ...(icon.props as Record<string, unknown>),
          })
        : null}
    </div>
  ) : null;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'secondary',
      size = 'default',
      children,
      disabled,
      block,
      loading,
      className,
      withoutHover,

      prefix,
      prefixClassName,
      prefixStyle,
      suffix,
      suffixClassName,
      suffixStyle,
      contentClassName,
      contentStyle,

      tooltip,
      tooltipShortcut,
      tooltipOptions,
      autoFocus,
      onClick,

      ...otherProps
    },
    upstreamRef
  ) => {
    const ref = useAutoFocus<HTMLButtonElement>(autoFocus);

    const handleClick = useCallback(
      (e: MouseEvent<HTMLButtonElement>) => {
        if (loading || disabled) return;
        onClick?.(e);
      },
      [disabled, loading, onClick]
    );

    const buttonRef = (el: HTMLButtonElement | null) => {
      ref.current = el;
      if (upstreamRef) {
        if (typeof upstreamRef === 'function') {
          upstreamRef(el);
        } else {
          upstreamRef.current = el;
        }
      }
    };

    return (
      <Tooltip content={tooltip} shortcut={tooltipShortcut} {...tooltipOptions}>
        <button
          {...otherProps}
          ref={buttonRef}
          className={clsx(styles.button, className)}
          data-loading={loading || undefined}
          data-block={block || undefined}
          disabled={disabled}
          data-disabled={disabled || undefined}
          data-size={size}
          data-variant={variant}
          data-no-hover={
            withoutHover || BUILD_CONFIG.isMobileEdition || undefined
          }
          data-mobile={BUILD_CONFIG.isMobileEdition}
          onClick={handleClick}
        >
          <IconSlot
            icon={prefix}
            loading={loading}
            className={prefixClassName}
            style={prefixStyle}
            variant={variant}
          />
          {children ? (
            <span
              className={clsx(styles.content, contentClassName)}
              style={contentStyle}
            >
              {children}
            </span>
          ) : null}
          <IconSlot
            icon={suffix}
            className={suffixClassName}
            style={suffixStyle}
          />
        </button>
      </Tooltip>
    );
  }
);
Button.displayName = 'Button';
export default Button;
