import type { DateCell } from '@affine/component';
import { DatePicker, IconButton, Menu, Scrollable } from '@affine/component';
import { MoveToTrash } from '@affine/core/components/page-list';
import { useTrashModalHelper } from '@affine/core/hooks/affine/use-trash-modal-helper';
import {
  useJournalHelper,
  useJournalInfoHelper,
  useJournalRouteHelper,
} from '@affine/core/hooks/use-journal';
import { useNavigateHelper } from '@affine/core/hooks/use-navigate-helper';
import { useI18n } from '@affine/i18n';
import {
  EdgelessIcon,
  MoreHorizontalIcon,
  PageIcon,
  TodayIcon,
} from '@blocksuite/icons/rc';
import type { DocRecord } from '@toeverything/infra';
import {
  DocService,
  DocsService,
  useLiveData,
  useService,
  WorkspaceService,
} from '@toeverything/infra';
import { assignInlineVars } from '@vanilla-extract/dynamic';
import clsx from 'clsx';
import dayjs from 'dayjs';
import type { HTMLAttributes, PropsWithChildren, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
  docRecord: DocRecord;
  right?: ReactNode;
}
const PageItem = ({ docRecord, right, className, ...attrs }: PageItemProps) => {
  const title = useLiveData(docRecord.title$);
  const mode = useLiveData(docRecord.mode$);
  const workspace = useService(WorkspaceService).workspace;
  const { isJournal } = useJournalInfoHelper(
    workspace.docCollection,
    docRecord.id
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

export const EditorJournalPanel = () => {
  const t = useI18n();
  const doc = useService(DocService).doc;
  const workspace = useService(WorkspaceService).workspace;
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
      // TODO(@catsjuice): add a dot to indicate journal
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
  docs: DocRecord[],
  field: 'updatedDate' | 'createDate',
  order: 'asc' | 'desc' = 'desc'
) => {
  return [...docs].sort((a, b) => {
    return (
      (order === 'asc' ? 1 : -1) *
      dayjs(b.meta$.value[field]).diff(dayjs(a.meta$.value[field]))
    );
  });
};

const DailyCountEmptyFallback = ({ name }: { name: NavItemName }) => {
  const t = useI18n();

  return (
    <div className={styles.dailyCountEmpty}>
      {name === 'createdToday'
        ? t['com.affine.journal.daily-count-created-empty-tips']()
        : t['com.affine.journal.daily-count-updated-empty-tips']()}
    </div>
  );
};
const JournalDailyCountBlock = ({ date }: JournalBlockProps) => {
  const workspace = useService(WorkspaceService).workspace;
  const nodeRef = useRef<HTMLDivElement>(null);
  const t = useI18n();
  const [activeItem, setActiveItem] = useState<NavItemName>('createdToday');
  const docRecords = useLiveData(useService(DocsService).list.docs$);

  const navigateHelper = useNavigateHelper();

  const getTodaysPages = useCallback(
    (field: 'createDate' | 'updatedDate') => {
      return sortPagesByDate(
        docRecords.filter(docRecord => {
          const meta = docRecord.meta$.value;
          if (meta.trash) return false;
          return meta[field] && dayjs(meta[field]).isSame(date, 'day');
        }),
        field
      );
    },
    [date, docRecords]
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
                      docRecord={pageRecord}
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
  docRecords: DocRecord[];
}
const ConflictList = ({
  docRecords,
  children,
  className,
  ...attrs
}: ConflictListProps) => {
  const navigateHelper = useNavigateHelper();
  const workspace = useService(WorkspaceService).workspace;
  const currentDoc = useService(DocService).doc;
  const { setTrashModal } = useTrashModalHelper(workspace.docCollection);

  const handleOpenTrashModal = useCallback(
    (docRecord: DocRecord) => {
      setTrashModal({
        open: true,
        pageIds: [docRecord.id],
        pageTitles: [docRecord.title$.value],
      });
    },
    [setTrashModal]
  );

  return (
    <div className={clsx(styles.journalConflictWrapper, className)} {...attrs}>
      {docRecords.map(docRecord => {
        const isCurrent = docRecord.id === currentDoc.id;
        return (
          <PageItem
            aria-selected={isCurrent}
            docRecord={docRecord}
            key={docRecord.id}
            right={
              <Menu
                items={
                  <MoveToTrash
                    onSelect={() => handleOpenTrashModal(docRecord)}
                  />
                }
              >
                <IconButton type="plain">
                  <MoreHorizontalIcon />
                </IconButton>
              </Menu>
            }
            onClick={() => navigateHelper.openPage(workspace.id, docRecord.id)}
          />
        );
      })}
      {children}
    </div>
  );
};
const JournalConflictBlock = ({ date }: JournalBlockProps) => {
  const t = useI18n();
  const workspace = useService(WorkspaceService).workspace;
  const docRecordList = useService(DocsService).list;
  const journalHelper = useJournalHelper(workspace.docCollection);
  const docs = journalHelper.getJournalsByDate(date.format('YYYY-MM-DD'));
  const docRecords = useLiveData(
    docRecordList.docs$.map(records =>
      records.filter(v => {
        return docs.some(doc => doc.id === v.id);
      })
    )
  );

  if (docs.length <= 1) return null;

  return (
    <ConflictList
      className={styles.journalConflictBlock}
      docRecords={docRecords.slice(0, MAX_CONFLICT_COUNT)}
    >
      {docs.length > MAX_CONFLICT_COUNT ? (
        <Menu
          items={
            <ConflictList docRecords={docRecords.slice(MAX_CONFLICT_COUNT)} />
          }
        >
          <div className={styles.journalConflictMoreTrigger}>
            {t['com.affine.journal.conflict-show-more']({
              count: (docRecords.length - MAX_CONFLICT_COUNT).toFixed(0),
            })}
          </div>
        </Menu>
      ) : null}
    </ConflictList>
  );
};
