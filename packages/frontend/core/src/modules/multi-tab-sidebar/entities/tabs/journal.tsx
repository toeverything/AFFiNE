import {
  type DateCell,
  DatePicker,
  IconButton,
  Menu,
  Scrollable,
} from '@affine/component';
import { MoveToTrash } from '@affine/core/components/page-list';
import { useTrashModalHelper } from '@affine/core/hooks/affine/use-trash-modal-helper';
import {
  useJournalHelper,
  useJournalInfoHelper,
  useJournalRouteHelper,
} from '@affine/core/hooks/use-journal';
import { useNavigateHelper } from '@affine/core/hooks/use-navigate-helper';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import {
  EdgelessIcon,
  MoreHorizontalIcon,
  PageIcon,
  TodayIcon,
} from '@blocksuite/icons';
import type { PageRecord } from '@toeverything/infra';
import {
  Doc,
  PageRecordList,
  useLiveData,
  Workspace,
} from '@toeverything/infra';
import { useService } from '@toeverything/infra/di';
import { assignInlineVars } from '@vanilla-extract/dynamic';
import clsx from 'clsx';
import dayjs from 'dayjs';
import type { HTMLAttributes, PropsWithChildren, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { SidebarTab } from '../sidebar-tab';
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
  pageRecord: PageRecord;
  right?: ReactNode;
}
const PageItem = ({
  pageRecord,
  right,
  className,
  ...attrs
}: PageItemProps) => {
  const title = useLiveData(pageRecord.title);
  const mode = useLiveData(pageRecord.mode);
  const workspace = useService(Workspace);
  const { isJournal } = useJournalInfoHelper(
    workspace.docCollection,
    pageRecord.id
  );

  const Icon = isJournal
    ? TodayIcon
    : mode === 'edgeless'
      ? EdgelessIcon
      : PageIcon;
  return (
    <div
      aria-label={title}
      className={clsx(className, styles.pageItem)}
      {...attrs}
    >
      <div className={styles.pageItemIcon}>
        <Icon width={20} height={20} />
      </div>
      <span className={styles.pageItemLabel}>{title}</span>
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
interface JournalBlockProps {
  date: dayjs.Dayjs;
}

const EditorJournalPanel = () => {
  const t = useAFFiNEI18N();
  const doc = useService(Doc);
  const workspace = useService(Workspace);
  const { journalDate, isJournal } = useJournalInfoHelper(
    workspace.docCollection,
    doc.id
  );
  const { openJournal } = useJournalRouteHelper(workspace.docCollection);
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

  const customDayRenderer = useCallback(
    (cell: DateCell) => {
      // TODO: add a dot to indicate journal
      // has performance issue for now, better to calculate it in advance
      // const hasJournal = !!getJournalsByDate(cell.date.format('YYYY-MM-DD'))?.length;
      const hasJournal = false;
      return (
        <button
          className={styles.journalDateCell}
          data-is-date-cell
          tabIndex={cell.focused ? 0 : -1}
          data-is-today={cell.isToday}
          data-not-current-month={cell.notCurrentMonth}
          data-selected={cell.selected}
          data-is-journal={isJournal}
          data-has-journal={hasJournal}
        >
          {cell.label}
          {hasJournal && !cell.selected ? (
            <div className={styles.journalDateCellDot} />
          ) : null}
        </button>
      );
    },
    [isJournal]
  );

  return (
    <div className={styles.journalPanel} data-is-journal={isJournal}>
      <div className={styles.calendar}>
        <DatePicker
          weekDays={t['com.affine.calendar-date-picker.week-days']()}
          monthNames={t['com.affine.calendar-date-picker.month-names']()}
          todayLabel={t['com.affine.calendar-date-picker.today']()}
          customDayRenderer={customDayRenderer}
          value={date}
          onChange={onDateSelect}
        />
      </div>
      <JournalConflictBlock date={dayjs(date)} />
      <JournalDailyCountBlock date={dayjs(date)} />
    </div>
  );
};

const sortPagesByDate = (
  pages: PageRecord[],
  field: 'updatedDate' | 'createDate',
  order: 'asc' | 'desc' = 'desc'
) => {
  return [...pages].sort((a, b) => {
    return (
      (order === 'asc' ? 1 : -1) *
      dayjs(b.meta.value[field]).diff(dayjs(a.meta.value[field]))
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
const JournalDailyCountBlock = ({ date }: JournalBlockProps) => {
  const workspace = useService(Workspace);
  const nodeRef = useRef<HTMLDivElement>(null);
  const t = useAFFiNEI18N();
  const [activeItem, setActiveItem] = useState<NavItemName>('createdToday');
  const pageRecordList = useService(PageRecordList);
  const pageRecords = useLiveData(pageRecordList.records);

  const navigateHelper = useNavigateHelper();

  const getTodaysPages = useCallback(
    (field: 'createDate' | 'updatedDate') => {
      return sortPagesByDate(
        pageRecords.filter(pageRecord => {
          if (pageRecord.meta.value.trash) return false;
          return (
            pageRecord.meta.value[field] &&
            dayjs(pageRecord.meta.value[field]).isSame(date, 'day')
          );
        }),
        field
      );
    },
    [date, pageRecords]
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
                  {renderList.map((pageRecord, index) => (
                    <PageItem
                      onClick={() =>
                        navigateHelper.openPage(workspace.id, pageRecord.id)
                      }
                      tabIndex={name === activeItem ? 0 : -1}
                      key={index}
                      pageRecord={pageRecord}
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
  extends PropsWithChildren,
    HTMLAttributes<HTMLDivElement> {
  pageRecords: PageRecord[];
}
const ConflictList = ({
  pageRecords,
  children,
  className,
  ...attrs
}: ConflictListProps) => {
  const navigateHelper = useNavigateHelper();
  const workspace = useService(Workspace);
  const currentDoc = useService(Doc);
  const { setTrashModal } = useTrashModalHelper(workspace.docCollection);

  const handleOpenTrashModal = useCallback(
    (pageRecord: PageRecord) => {
      setTrashModal({
        open: true,
        pageIds: [pageRecord.id],
        pageTitles: [pageRecord.meta.value.title],
      });
    },
    [setTrashModal]
  );

  return (
    <div className={clsx(styles.journalConflictWrapper, className)} {...attrs}>
      {pageRecords.map(pageRecord => {
        const isCurrent = pageRecord.id === currentDoc.id;
        return (
          <PageItem
            aria-selected={isCurrent}
            pageRecord={pageRecord}
            key={pageRecord.id}
            right={
              <Menu
                items={
                  <MoveToTrash
                    onSelect={() => handleOpenTrashModal(pageRecord)}
                  />
                }
              >
                <IconButton type="plain">
                  <MoreHorizontalIcon />
                </IconButton>
              </Menu>
            }
            onClick={() => navigateHelper.openPage(workspace.id, pageRecord.id)}
          />
        );
      })}
      {children}
    </div>
  );
};
const JournalConflictBlock = ({ date }: JournalBlockProps) => {
  const t = useAFFiNEI18N();
  const workspace = useService(Workspace);
  const pageRecordList = useService(PageRecordList);
  const journalHelper = useJournalHelper(workspace.docCollection);
  const docs = journalHelper.getJournalsByDate(date.format('YYYY-MM-DD'));
  const pageRecords = useLiveData(pageRecordList.records).filter(v => {
    return docs.some(doc => doc.id === v.id);
  });

  if (docs.length <= 1) return null;

  return (
    <ConflictList
      className={styles.journalConflictBlock}
      pageRecords={pageRecords.slice(0, MAX_CONFLICT_COUNT)}
    >
      {docs.length > MAX_CONFLICT_COUNT ? (
        <Menu
          items={
            <ConflictList pageRecords={pageRecords.slice(MAX_CONFLICT_COUNT)} />
          }
        >
          <div className={styles.journalConflictMoreTrigger}>
            {t['com.affine.journal.conflict-show-more']({
              count: (pageRecords.length - MAX_CONFLICT_COUNT).toFixed(0),
            })}
          </div>
        </Menu>
      ) : null}
    </ConflictList>
  );
};

export const journalTab: SidebarTab = {
  name: 'journal',
  icon: <TodayIcon />,
  Component: EditorJournalPanel,
};
