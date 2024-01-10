import {
  AFFiNEDatePicker,
  IconButton,
  Menu,
  Scrollable,
} from '@affine/component';
import { MoveToTrash } from '@affine/core/components/page-list';
import { useTrashModalHelper } from '@affine/core/hooks/affine/use-trash-modal-helper';
import {
  useJournalHelper,
  useJournalInfoHelper,
} from '@affine/core/hooks/use-journal';
import { useNavigateHelper } from '@affine/core/hooks/use-navigate-helper';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import {
  EdgelessIcon,
  MoreHorizontalIcon,
  PageIcon,
  TodayIcon,
} from '@blocksuite/icons';
import type { Page } from '@blocksuite/store';
import { assignInlineVars } from '@vanilla-extract/dynamic';
import clsx from 'clsx';
import dayjs from 'dayjs';
import type { HTMLAttributes, PropsWithChildren, ReactNode } from 'react';
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
interface PageItemProps extends HTMLAttributes<HTMLDivElement> {
  page: Page;
  right?: ReactNode;
}
const PageItem = ({ page, right, className, ...attrs }: PageItemProps) => {
  const { isJournal } = useJournalInfoHelper(page.workspace, page.id);

  const Icon = isJournal
    ? TodayIcon
    : page.meta.mode === 'edgeless'
      ? EdgelessIcon
      : PageIcon;
  return (
    <div
      aria-label={page.meta.title}
      className={clsx(className, styles.pageItem)}
      {...attrs}
    >
      <div className={styles.pageItemIcon}>
        <Icon width={20} height={20} />
      </div>
      <span className={styles.pageItemLabel}>{page.meta.title}</span>
      {right}
    </div>
  );
};

type NavItemName = 'createdToday' | 'updatedToday';
interface NavItem {
  name: NavItemName;
  label: string;
  count: number;
}
interface JournalBlockProps extends EditorExtensionProps {
  date: dayjs.Dayjs;
}

const EditorJournalPanel = (props: EditorExtensionProps) => {
  const { workspace, page } = props;
  const { journalDate, isJournal } = useJournalInfoHelper(
    page.workspace,
    page.id
  );
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
    <div className={styles.journalPanel} data-is-journal={isJournal}>
      <AFFiNEDatePicker
        inline
        value={date}
        onSelect={onDateSelect}
        calendarClassName={styles.calendar}
      />
      <JournalConflictBlock date={dayjs(date)} {...props} />
      <JournalDailyCountBlock date={dayjs(date)} {...props} />
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
const JournalDailyCountBlock = ({ workspace, date }: JournalBlockProps) => {
  const nodeRef = useRef<HTMLDivElement>(null);
  const t = useAFFiNEI18N();
  const [activeItem, setActiveItem] = useState<NavItemName>('createdToday');

  const navigateHelper = useNavigateHelper();

  const getTodaysPages = useCallback(
    (field: 'createDate' | 'updatedDate') => {
      const pages: Page[] = [];
      Array.from(workspace.pages.values()).forEach(page => {
        if (page.meta.trash) return;
        if (page.meta[field] && dayjs(page.meta[field]).isSame(date, 'day')) {
          pages.push(page);
        }
      });
      return sortPagesByDate(pages, field);
    },
    [date, workspace.pages]
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

const MAX_CONFLICT_COUNT = 5;
interface ConflictListProps
  extends JournalBlockProps,
    PropsWithChildren,
    HTMLAttributes<HTMLDivElement> {
  pages: Page[];
}
const ConflictList = ({
  page: currentPage,
  pages,
  workspace,
  children,
  className,
  ...attrs
}: ConflictListProps) => {
  const navigateHelper = useNavigateHelper();
  const { setTrashModal } = useTrashModalHelper(workspace);

  const handleOpenTrashModal = useCallback(
    (page: Page) => {
      if (!page.meta) return;
      setTrashModal({
        open: true,
        pageIds: [page.id],
        pageTitles: [page.meta.title],
      });
    },
    [setTrashModal]
  );

  return (
    <div className={clsx(styles.journalConflictWrapper, className)} {...attrs}>
      {pages.map(page => {
        const isCurrent = page.id === currentPage.id;
        return (
          <PageItem
            aria-label={page.meta.title}
            aria-selected={isCurrent}
            page={page}
            key={page.id}
            right={
              <Menu
                items={
                  <MoveToTrash onSelect={() => handleOpenTrashModal(page)} />
                }
              >
                <IconButton type="plain">
                  <MoreHorizontalIcon />
                </IconButton>
              </Menu>
            }
            onClick={() => navigateHelper.openPage(workspace.id, page.id)}
          />
        );
      })}
      {children}
    </div>
  );
};
const JournalConflictBlock = (props: JournalBlockProps) => {
  const { workspace, date } = props;
  const t = useAFFiNEI18N();
  const journalHelper = useJournalHelper(workspace);
  const pages = journalHelper.getJournalsByDate(date.format('YYYY-MM-DD'));

  if (pages.length <= 1) return null;

  return (
    <ConflictList
      className={styles.journalConflictBlock}
      pages={pages.slice(0, MAX_CONFLICT_COUNT)}
      {...props}
    >
      {pages.length > MAX_CONFLICT_COUNT ? (
        <Menu
          items={
            <ConflictList pages={pages.slice(MAX_CONFLICT_COUNT)} {...props} />
          }
        >
          <div className={styles.journalConflictMoreTrigger}>
            {t['com.affine.journal.conflict-show-more']({
              count: (pages.length - MAX_CONFLICT_COUNT).toFixed(0),
            })}
          </div>
        </Menu>
      ) : null}
    </ConflictList>
  );
};

export const journalExtension: EditorExtension = {
  name: 'journal',
  icon: <TodayIcon />,
  Component: EditorJournalPanel,
};
