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
        ...props.style,
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

export const withinDaysAgo = (date: Date, days: number): boolean => {
  const startDate = new Date();
  const day = startDate.getDay();
  const month = startDate.getMonth();
  const year = startDate.getFullYear();
  return new Date(year, month, day - days) <= date;
};

export const betweenDaysAgo = (
  date: Date,
  days0: number,
  days1: number
): boolean => {
  return !withinDaysAgo(date, days0) && withinDaysAgo(date, days1);
};
