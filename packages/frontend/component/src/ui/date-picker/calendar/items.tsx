import { ArrowLeftSmallIcon, ArrowRightSmallIcon } from '@blocksuite/icons/rc';
import { assignInlineVars } from '@vanilla-extract/dynamic';
import clsx from 'clsx';
import type { HTMLAttributes, PropsWithChildren, ReactNode } from 'react';
import { forwardRef, memo } from 'react';

import { IconButton } from '../../button';
import * as styles from './calendar.css';
import type { DateCell } from './types';

interface HeaderLayoutProps extends HTMLAttributes<HTMLDivElement> {
  mode: 'day' | 'month' | 'year';
  length: number;
  left: React.ReactNode;
  right: React.ReactNode;
}

const autoHeight = { height: 'auto' };
/**
 * The `DatePicker` should work with different width
 * This is a hack to make header's item align with calendar cell's label, **instead of the cell**
 * @param length: number of items that calendar body row has
 */
const HeaderLayout = memo(function HeaderLayout({
  length,
  left,
  right,
  className,
  style,
  mode,
  ...attrs
}: HeaderLayoutProps) {
  const vars = assignInlineVars({ '--len': `${length}` });
  const finalStyle = { ...vars, ...style };
  return (
    <div
      className={clsx(styles.monthViewRow, className)}
      style={finalStyle}
      {...attrs}
    >
      {Array.from({ length })
        .fill(0)
        .map((_, index) => {
          const isLeft = index === 0;
          const isRight = index === length - 1;
          return (
            <div
              key={index}
              data-length={length}
              data-is-left={isLeft}
              data-is-right={isRight}
              className={clsx({
                [styles.monthViewBodyCell]: mode === 'day',
                [styles.yearViewBodyCell]: mode === 'month',
                [styles.decadeViewBodyCell]: mode === 'year',
              })}
              style={autoHeight}
            >
              <div className={styles.headerLayoutCellOrigin}>
                {isLeft ? left : isRight ? right : null}
              </div>
            </div>
          );
        })}
    </div>
  );
});

interface CalendarLayoutProps {
  headerLeft: ReactNode;
  headerRight: ReactNode;
  body: ReactNode;
  length: number;
  mode: 'day' | 'month' | 'year';
}
export const CalendarLayout = forwardRef<HTMLDivElement, CalendarLayoutProps>(
  (
    { headerLeft, headerRight, body, length, mode }: CalendarLayoutProps,
    ref
  ) => {
    return (
      <div className={styles.calendarWrapper} ref={ref} data-mode={mode}>
        <HeaderLayout
          mode={mode}
          length={length}
          left={headerLeft}
          right={headerRight}
          className={styles.calendarHeader}
        />
        {body}
      </div>
    );
  }
);
CalendarLayout.displayName = 'CalendarLayout';

export const DefaultDateCell = ({
  label,
  date,
  isToday,
  notCurrentMonth,
  selected,
  focused,
}: DateCell) => {
  return (
    <button
      data-is-date-cell
      data-value={date.format('YYYY-MM-DD')}
      data-is-today={isToday}
      data-not-current-month={notCurrentMonth}
      data-selected={selected}
      tabIndex={focused ? 0 : -1}
      className={styles.monthViewBodyCellInner}
    >
      {label}
    </button>
  );
};

interface NavButtonsProps extends PropsWithChildren {
  prevDisabled?: boolean;
  nextDisabled?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
}
export const NavButtons = memo(function NavButtons({
  children,
  prevDisabled,
  nextDisabled,
  onPrev,
  onNext,
}: NavButtonsProps) {
  return (
    <div className={styles.headerNavButtons} key="nav-btn-group">
      <IconButton
        key="nav-btn-prev"
        size="16"
        disabled={prevDisabled}
        data-testid="date-picker-nav-prev"
        onClick={onPrev}
      >
        <ArrowLeftSmallIcon />
      </IconButton>

      {children ?? <div className={styles.headerNavGapFallback} />}

      <IconButton
        key="nav-btn-next"
        size="16"
        disabled={nextDisabled}
        data-testid="date-picker-nav-next"
        onClick={onNext}
      >
        <ArrowRightSmallIcon />
      </IconButton>
    </div>
  );
});
