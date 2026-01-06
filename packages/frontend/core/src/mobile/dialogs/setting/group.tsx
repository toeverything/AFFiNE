import { ConfigModal } from '@affine/core/components/mobile';
import clsx from 'clsx';
import {
  type CSSProperties,
  forwardRef,
  type HTMLProps,
  type ReactNode,
} from 'react';

import * as styles from './group.css';

export interface SettingGroupProps extends Omit<
  HTMLProps<HTMLDivElement>,
  'title'
> {
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
      <ConfigModal.RowGroup
        {...attrs}
        ref={ref}
        title={title}
        className={clsx(styles.group, className)}
        contentClassName={contentClassName}
        contentStyle={contentStyle}
      >
        {children}
      </ConfigModal.RowGroup>
    );
  }
);
