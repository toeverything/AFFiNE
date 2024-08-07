import { Button } from '@affine/component';
import clsx from 'clsx';
import {
  cloneElement,
  forwardRef,
  type HTMLAttributes,
  type ReactElement,
  type Ref,
  type SVGProps,
} from 'react';

import * as styles from './empty-section.css';

interface ExplorerEmptySectionProps extends HTMLAttributes<HTMLDivElement> {
  icon: ((props: SVGProps<SVGSVGElement>) => JSX.Element) | ReactElement;
  message: string;
  messageTestId?: string;
  actionText?: string;
  onActionClick?: () => void;
}

export const ExplorerEmptySection = forwardRef(function ExplorerEmptySection(
  {
    icon: Icon,
    message,
    messageTestId,
    actionText,
    children,
    className,
    onActionClick,
    ...attrs
  }: ExplorerEmptySectionProps,
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
});
