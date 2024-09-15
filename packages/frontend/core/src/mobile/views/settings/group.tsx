import clsx from 'clsx';
import {
  type CSSProperties,
  forwardRef,
  type HTMLProps,
  type ReactNode,
} from 'react';

import * as styles from './group.css';

export interface SettingGroupProps
  extends Omit<HTMLProps<HTMLDivElement>, 'title'> {
  title?: ReactNode;
  contentClassName?: string;
  contentStyle?: CSSProperties;
}

export const SettingGroup = forwardRef<HTMLDivElement, SettingGroupProps>(
  function SettingGroup(
    { children, title, className, contentClassName, contentStyle, ...attrs },
    ref
  ) {
    return (
      <div className={clsx(styles.group, className)} ref={ref} {...attrs}>
        {title ? <h6 className={styles.title}>{title}</h6> : null}
        <div
          className={clsx(styles.content, contentClassName)}
          style={contentStyle}
        >
          {children}
        </div>
      </div>
    );
  }
);
