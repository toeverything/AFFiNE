import clsx from 'clsx';
import { forwardRef } from 'react';

import * as styles from './list.css';
import type { ColWrapperProps } from './types';

export const ColWrapper = forwardRef<HTMLDivElement, ColWrapperProps>(
  function ColWrapper(
    {
      flex,
      alignment,
      hideInSmallContainer,
      hidden,
      className,
      style,
      children,
      ...rest
    }: ColWrapperProps,
    ref
  ) {
    return (
      <div
        {...rest}
        ref={ref}
        data-testid="page-list-flex-wrapper"
        style={{
          ...style,
          flexGrow: flex,
          flexBasis: flex ? `${(flex / 12) * 100}%` : 'auto',
          justifyContent: alignment,
        }}
        data-hide-item={hideInSmallContainer ? true : undefined}
        className={clsx(className, styles.colWrapper, {
          [styles.hidden]: hidden,
          [styles.hideInSmallContainer]: hideInSmallContainer,
        })}
      >
        {children}
      </div>
    );
  }
);

export const withinDaysAgo = (date: Date, days: number): boolean => {
  const startDate = new Date();
  const day = startDate.getDate();
  const month = startDate.getMonth();
  const year = startDate.getFullYear();
  return new Date(year, month, day - days + 1) <= date;
};

export const betweenDaysAgo = (
  date: Date,
  days0: number,
  days1: number
): boolean => {
  return !withinDaysAgo(date, days0) && withinDaysAgo(date, days1);
};

// credit: https://github.com/facebook/fbjs/blob/main/packages/fbjs/src/core/shallowEqual.js
export function shallowEqual(objA: any, objB: any) {
  if (Object.is(objA, objB)) {
    return true;
  }

  if (
    typeof objA !== 'object' ||
    objA === null ||
    typeof objB !== 'object' ||
    objB === null
  ) {
    return false;
  }

  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);

  if (keysA.length !== keysB.length) {
    return false;
  }

  // Test for A's keys different from B.
  for (const key of keysA) {
    if (
      !Object.prototype.hasOwnProperty.call(objB, key) ||
      !Object.is(objA[key], objB[key])
    ) {
      return false;
    }
  }

  return true;
}
