import { Button } from '@affine/component';
import clsx from 'clsx';
import {
  cloneElement,
  forwardRef,
  type HTMLAttributes,
  type JSX,
  type ReactElement,
  type Ref,
  type SVGAttributes,
  type SVGProps,
} from 'react';

import * as styles from './empty-section.css';

interface NavigationPanelEmptySectionProps extends HTMLAttributes<HTMLDivElement> {
  icon:
    | ((props: SVGProps<SVGSVGElement>) => JSX.Element)
    | ReactElement<SVGAttributes<SVGElement>>;
  message: string;
  messageTestId?: string;
  actionText?: string;
  onActionClick?: () => void;
}

export const NavigationPanelEmptySection = forwardRef(
  function NavigationPanelEmptySection(
    {
      icon: Icon,
      message,
      messageTestId,
      actionText,
      children,
      className,
      onActionClick,
      ...attrs
    }: NavigationPanelEmptySectionProps,
    ref: Ref<HTMLDivElement>
  ) {
    const icon =
      typeof Icon === 'function' ? (
        <Icon className={styles.icon} />
      ) : (
        cloneElement(Icon, { className: styles.icon })
      );

    return (
      <div className={clsx(styles.content, className)} ref={ref} {...attrs}>
        <div className={styles.iconWrapper}>{icon}</div>
        <div data-testid={messageTestId} className={styles.message}>
          {message}
        </div>
        {actionText ? (
          <Button className={styles.newButton} onClick={onActionClick}>
            {actionText}
          </Button>
        ) : null}
        {children}
      </div>
    );
  }
);
