import { IconButton } from '@affine/component';
import { ArrowLeftSmallIcon } from '@blocksuite/icons/rc';
import clsx from 'clsx';
import {
  forwardRef,
  type HtmlHTMLAttributes,
  type ReactNode,
  useCallback,
} from 'react';

import * as styles from './styles.css';

export interface PageHeaderProps
  extends Omit<HtmlHTMLAttributes<HTMLHeadElement>, 'prefix'> {
  /**
   * whether to show back button
   */
  back?: boolean;

  /**
   * prefix content, shown after back button(if exists)
   */
  prefix?: ReactNode;

  /**
   * suffix content
   */
  suffix?: ReactNode;

  /**
   * Weather to center the content
   * @default true
   */
  centerContent?: boolean;

  prefixClassName?: string;
  prefixStyle?: React.CSSProperties;
  suffixClassName?: string;
  suffixStyle?: React.CSSProperties;
}
export const PageHeader = forwardRef<HTMLHeadElement, PageHeaderProps>(
  function PageHeader(
    {
      back,
      prefix,
      suffix,
      children,
      className,
      centerContent = true,
      prefixClassName,
      prefixStyle,
      suffixClassName,
      suffixStyle,
      ...attrs
    },
    ref
  ) {
    const handleRouteBack = useCallback(() => {
      history.back();
    }, []);

    return (
      <header ref={ref} className={clsx(styles.root, className)} {...attrs}>
        <section
          className={clsx(styles.prefix, prefixClassName)}
          style={prefixStyle}
        >
          {back ? (
            <IconButton
              size={24}
              style={{ padding: 10 }}
              onClick={handleRouteBack}
              icon={<ArrowLeftSmallIcon />}
            />
          ) : null}
          {prefix}
        </section>

        <section className={clsx(styles.content, { center: centerContent })}>
          {children}
        </section>

        <section
          className={clsx(styles.suffix, suffixClassName)}
          style={suffixStyle}
        >
          {suffix}
        </section>
      </header>
    );
  }
);
