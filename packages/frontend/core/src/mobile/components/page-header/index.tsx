import { SafeArea } from '@affine/component';
import clsx from 'clsx';
import type {
  HtmlHTMLAttributes,
  ReactElement,
  ReactNode,
  SVGAttributes,
} from 'react';
import { forwardRef } from 'react';

import { NavigationBackButton } from '../navigation-back';
import * as styles from './styles.css';

export interface PageHeaderProps extends Omit<
  HtmlHTMLAttributes<HTMLHeadElement>,
  'prefix'
> {
  /**
   * whether to show back button
   */
  back?: boolean;
  backIcon?: ReactElement<SVGAttributes<SVGElement>>;
  /**
   * Override back button action
   */
  backAction?: () => void;

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
  contentClassName?: string;

  prefixClassName?: string;
  prefixStyle?: React.CSSProperties;
  suffixClassName?: string;
  suffixStyle?: React.CSSProperties;

  /**
   * Custom bottom content
   */
  bottom?: ReactNode;
  /**
   * Bottom Spacer height
   */
  bottomSpacer?: number;
}
export const PageHeader = forwardRef<HTMLDivElement, PageHeaderProps>(
  function PageHeader(
    {
      back,
      backIcon,
      backAction,
      prefix,
      suffix,
      children,
      className,
      centerContent = true,
      contentClassName,
      prefixClassName,
      prefixStyle,
      suffixClassName,
      suffixStyle,
      bottom,
      bottomSpacer,
      ...attrs
    },
    ref
  ) {
    return (
      <>
        <SafeArea
          top
          ref={ref}
          className={clsx(styles.root, className)}
          data-testid="mobile-page-header"
          {...attrs}
        >
          <header className={styles.inner}>
            <section
              className={clsx(styles.prefix, prefixClassName)}
              style={prefixStyle}
            >
              {back ? (
                <NavigationBackButton icon={backIcon} backAction={backAction} />
              ) : null}
              {prefix}
            </section>

            <section
              className={clsx(styles.content, contentClassName, {
                center: centerContent,
              })}
            >
              {children}
            </section>

            <section
              className={clsx(styles.suffix, suffixClassName)}
              style={suffixStyle}
            >
              {suffix}
            </section>
          </header>
          {bottom}
        </SafeArea>

        {/* Spacer */}
        <SafeArea top>
          <div className={styles.headerSpacer} />
          {bottom ? <div style={{ height: bottomSpacer ?? 0 }} /> : null}
        </SafeArea>
      </>
    );
  }
);
