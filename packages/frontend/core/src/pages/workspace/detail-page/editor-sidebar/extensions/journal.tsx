import { AFFiNEDatePicker, Scrollable } from '@affine/component';
import {
  useJournalHelper,
  useJournalInfoHelper,
} from '@affine/core/hooks/use-journal';
import { useNavigateHelper } from '@affine/core/hooks/use-navigate-helper';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { EdgelessIcon, PageIcon, TodayIcon } from '@blocksuite/icons';
import type { Page } from '@blocksuite/store';
import { assignInlineVars } from '@vanilla-extract/dynamic';
import clsx from 'clsx';
import dayjs from 'dayjs';
import type { HTMLAttributes, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { EditorExtension, EditorExtensionProps } from '..';
import * as styles from './journal.css';

/**
 * @internal
 */
const CountDisplay = ({
  count,
  max = 99,
  ...attrs
}: { count: number; max?: number } & HTMLAttributes<HTMLSpanElement>) => {
  return <span {...attrs}>{count > max ? `${max}+` : count}</span>;
};
interface PageItemProps extends HTMLAttributes<HTMLButtonElement> {
  page: Page;
  right?: ReactNode;
}
const PageItem = ({ page, right, className, ...attrs }: PageItemProps) => {
  const { isJournal } = useJournalInfoHelper(page.meta);

  const icon = isJournal ? (
    <TodayIcon width={20} height={20} />
  ) : page.meta.mode === 'edgeless' ? (
    <EdgelessIcon width={20} height={20} />
  ) : (
    <PageIcon width={20} height={20} />
  );
  return (
    <button
      aria-label={page.meta.title}
      className={clsx(className, styles.pageItem)}
      {...attrs}
    >
      <div className={styles.pageItemIcon}>{icon}</div>
      <span className={styles.pageItemLabel}>{page.meta.title}</span>
      {right}
    </button>
  );
};

type NavItemName = 'createdToday' | 'updatedToday';
interface NavItem {
  name: NavItemName;
  label: string;
  count: number;
}

const EditorJournalPanel = (props: EditorExtensionProps) => {
  const { workspace, page } = props;
  const { journalDate } = useJournalInfoHelper(page?.meta);
  const { openJournal } = useJournalHelper(workspace);
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'));

  useEffect(() => {
    journalDate && setDate(journalDate.format('YYYY-MM-DD'));
  }, [journalDate]);

  const onDateSelect = useCallback(
    (date: string) => {
      if (journalDate && dayjs(date).isSame(dayjs(journalDate))) return;
      openJournal(date);
    },
    [journalDate, openJournal]
  );

  return (
    <div className={styles.journalPanel}>
      <AFFiNEDatePicker
        inline
        value={date}
        onSelect={onDateSelect}
        calendarClassName={styles.calendar}
      />

      <JournalDailyCountBlock {...props} />
    </div>
  );
};

const sortPagesByDate = (
  pages: Page[],
  field: 'updatedDate' | 'createDate',
  order: 'asc' | 'desc' = 'desc'
) => {
  return [...pages].sort((a, b) => {
    return (
      (order === 'asc' ? 1 : -1) *
      dayjs(b.meta[field]).diff(dayjs(a.meta[field]))
    );
  });
};

const DailyCountEmptyFallback = ({ name }: { name: NavItemName }) => {
  const t = useAFFiNEI18N();

  return (
    <div className={styles.dailyCountEmpty}>
      {name === 'createdToday'
        ? t['com.affine.journal.daily-count-created-empty-tips']()
        : t['com.affine.journal.daily-count-updated-empty-tips']()}
    </div>
  );
};
const JournalDailyCountBlock = ({ workspace, page }: EditorExtensionProps) => {
  const nodeRef = useRef<HTMLDivElement>(null);
  const t = useAFFiNEI18N();
  const { journalDate } = useJournalInfoHelper(page?.meta);
  const [activeItem, setActiveItem] = useState<NavItemName>('createdToday');

  const navigateHelper = useNavigateHelper();

  const getTodaysPages = useCallback(
    (field: 'createDate' | 'updatedDate') => {
      const pages: Page[] = [];
      Array.from(workspace.pages.values()).forEach(page => {
        if (page.meta.trash) return;
        if (
          page.meta[field] &&
          dayjs(page.meta[field]).isSame(journalDate, 'day')
        ) {
          pages.push(page);
        }
      });
      return sortPagesByDate(pages, field);
    },
    [journalDate, workspace.pages]
  );

  const createdToday = useMemo(
    () => getTodaysPages('createDate'),
    [getTodaysPages]
  );
  const updatedToday = useMemo(
    () => getTodaysPages('updatedDate'),
    [getTodaysPages]
  );

  const headerItems = useMemo<NavItem[]>(
    () => [
      {
        name: 'createdToday',
        label: t['com.affine.journal.created-today'](),
        count: createdToday.length,
      },
      {
        name: 'updatedToday',
        label: t['com.affine.journal.updated-today'](),
        count: updatedToday.length,
      },
    ],
    [createdToday.length, t, updatedToday.length]
  );

  const activeIndex = headerItems.findIndex(({ name }) => name === activeItem);

  const vars = assignInlineVars({
    '--active-index': String(activeIndex),
    '--item-count': String(headerItems.length),
  });

  return (
    <div className={styles.dailyCount} style={vars}>
      <header className={styles.dailyCountHeader}>
        {headerItems.map(({ label, count, name }, index) => {
          return (
            <button
              onClick={() => setActiveItem(name)}
              aria-selected={activeItem === name}
              className={styles.dailyCountNav}
              key={index}
            >
              {label}
              &nbsp;
              <CountDisplay count={count} />
            </button>
          );
        })}
      </header>

      <main className={styles.dailyCountContainer} data-active={activeItem}>
        {headerItems.map(({ name }) => {
          const renderList =
            name === 'createdToday' ? createdToday : updatedToday;
          if (renderList.length === 0)
            return (
              <div key={name} className={styles.dailyCountItem}>
                <DailyCountEmptyFallback name={name} />
              </div>
            );
          return (
            <Scrollable.Root key={name} className={styles.dailyCountItem}>
              <Scrollable.Scrollbar />
              <Scrollable.Viewport>
                <div className={styles.dailyCountContent} ref={nodeRef}>
                  {renderList.map((page, index) => (
                    <PageItem
                      onClick={() =>
                        navigateHelper.openPage(workspace.id, page.id)
                      }
                      tabIndex={name === activeItem ? 0 : -1}
                      key={index}
                      page={page}
                    />
                  ))}
                </div>
              </Scrollable.Viewport>
            </Scrollable.Root>
          );
        })}
      </main>
    </div>
  );
};

export const journalExtension: EditorExtension = {
  name: 'journal',
  icon: <TodayIcon />,
  Component: EditorJournalPanel,
};
