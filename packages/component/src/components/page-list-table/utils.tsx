import clsx from 'clsx';
import type { PropsWithChildren } from 'react';

import * as styles from './page-list.css';

export type FlexWrapperProps = PropsWithChildren<{
  flex: number;
  alignment?: 'start' | 'center' | 'end';
  styles?: React.CSSProperties;
}> &
  React.HTMLAttributes<Element>;

export const FlexWrapper = (props: FlexWrapperProps) => {
  return (
    <div
      {...props}
      data-testid="page-list-flex-wrapper"
      style={{
        ...props.styles,
        flexGrow: props.flex,
        flexBasis: `${(props.flex / 12) * 100}%`,
        justifyContent: props.alignment,
      }}
      className={clsx(props.className, styles.flexWrapper)}
    >
      {props.children}
    </div>
  );
};
