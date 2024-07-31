import { Button } from '@affine/component';
import clsx from 'clsx';
import {
  forwardRef,
  type HTMLAttributes,
  type Ref,
  type SVGProps,
} from 'react';

import * as styles from './empty-layout.css';

interface ExplorerGroupEmptyProps extends HTMLAttributes<HTMLDivElement> {
  icon: (props: SVGProps<SVGSVGElement>) => JSX.Element;
  message: string;
  messageTestId?: string;
  actionText?: string;
  onActionClick?: () => void;
}

export const ExplorerGroupEmpty = forwardRef(function ExplorerGroupEmpty(
  {
    icon: Icon,
    message,
    messageTestId,
    actionText,
    children,
    className,
    onActionClick,
    ...attrs
  }: ExplorerGroupEmptyProps,
  ref: Ref<HTMLDivElement>
) {
  return (
    <div className={clsx(styles.content, className)} ref={ref} {...attrs}>
      <div className={styles.iconWrapper}>
        <Icon className={styles.icon} />
      </div>
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
