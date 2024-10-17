import type { DateCell } from '@affine/component';
import {
  DatePicker,
  IconButton,
  Menu,
  MenuItem,
  MenuSeparator,
  Scrollable,
} from '@affine/component';
import { useTrashModalHelper } from '@affine/core/components/hooks/affine/use-trash-modal-helper';
import { useJournalRouteHelper } from '@affine/core/components/hooks/use-journal';
import { MoveToTrash } from '@affine/core/components/page-list';
import { DocDisplayMetaService } from '@affine/core/modules/doc-display-meta';
import { JournalService } from '@affine/core/modules/journal';
import { WorkbenchLink } from '@affine/core/modules/workbench';
import { useI18n } from '@affine/i18n';
import { CalendarXmarkIcon, EditIcon } from '@blocksuite/icons/rc';
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
import { useCallback, useMemo, useRef, useState } from 'react';

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
interface PageItemProps
  extends Omit<HTMLAttributes<HTMLAnchorElement>, 'onClick'> {
  docId: string;
  right?: ReactNode;
  duplicate?: boolean;
}
const PageItem = ({
  docId,
  right,
  duplicate,
  className,
  ...attrs
}: PageItemProps) => {
  const i18n = useI18n();
  const docDisplayMetaService = useService(DocDisplayMetaService);
  const Icon = useLiveData(
    docDisplayMetaService.icon$(docId, { compareDate: new Date() })
  );
  const titleMeta = useLiveData(docDisplayMetaService.title$(docId));
  const title = i18n.t(titleMeta);

  return (
    <WorkbenchLink
      data-testid="journal-conflict-item"
      aria-label={title}
      to={`/${docId}`}
      className={clsx(className, styles.pageItem)}
      {...attrs}
    >
      <div className={styles.pageItemIcon}>
        <Icon width={20} height={20} />
      </div>
      <div className={styles.pageItemLabel}>
        {title}
        {duplicate ? (
          <div className={styles.duplicateTag}>
            {i18n['com.affine.page-properties.property.journal-duplicated']()}
          </div>
        ) : null}
      </div>
      {right}
    </WorkbenchLink>
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

const mobile = environment.isMobile;
export const EditorJournalPanel = () => {
  const t = useI18n();
  const doc = useService(DocService).doc;
  const workspace = useService(WorkspaceService).workspace;
  const journalService = useService(JournalService);
  const journalDateStr = useLiveData(journalService.journalDate$(doc.id));
  const journalDate = journalDateStr ? dayjs(journalDateStr) : null;
  const isJournal = !!journalDate;
  const { openJournal } = useJournalRouteHelper(workspace.docCollection);

  const onDateSelect = useCallback(
    (date: string) => {
      if (journalDate && dayjs(date).isSame(dayjs(journalDate))) return;
      openJournal(date);
    },
    [journalDate, openJournal]
  );

  const allJournalDates = useLiveData(journalService.allJournalDates$);

  const customDayRenderer = useCallback(
    (cell: DateCell) => {
      const hasJournal = allJournalDates.has(cell.date.format('YYYY-MM-DD'));
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
          data-mobile={mobile}
        >
          {cell.label}
          {hasJournal && !cell.selected ? (
            <div className={styles.journalDateCellDot} />
          ) : null}
        </button>
      );
    },
    [allJournalDates, isJournal]
  );

  return (
    <div
      className={styles.journalPanel}
      data-is-journal={isJournal}
      data-testid="sidebar-journal-panel"
    >
      <div data-mobile={mobile} className={styles.calendar}>
        <DatePicker
          weekDays={t['com.affine.calendar-date-picker.week-days']()}
          monthNames={t['com.affine.calendar-date-picker.month-names']()}
          todayLabel={t['com.affine.calendar-date-picker.today']()}
          customDayRenderer={customDayRenderer}
          value={journalDate?.format('YYYY-MM-DD')}
          onChange={onDateSelect}
          monthHeaderCellClassName={styles.journalDateCellWrapper}
          monthBodyCellClassName={styles.journalDateCellWrapper}
        />
      </div>
      {journalDate ? (
        <>
          <JournalConflictBlock date={journalDate} />
          <JournalDailyCountBlock date={journalDate} />
        </>
      ) : null}
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
  const nodeRef = useRef<HTMLDivElement>(null);
  const t = useI18n();
  const [activeItem, setActiveItem] = useState<NavItemName>('createdToday');
  const docRecords = useLiveData(useService(DocsService).list.docs$);

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
                      tabIndex={name === activeItem ? 0 : -1}
                      key={index}
                      docId={pageRecord.id}
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
  const t = useI18n();
  const currentDoc = useService(DocService).doc;
  const journalService = useService(JournalService);
  const { setTrashModal } = useTrashModalHelper();

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
  const handleRemoveJournalMark = useCallback(
    (docId: string) => {
      journalService.removeJournalDate(docId);
    },
    [journalService]
  );

  return (
    <div
      data-testid="journal-conflict-list"
      className={clsx(styles.journalConflictWrapper, className)}
      {...attrs}
    >
      {docRecords.map(docRecord => {
        const isCurrent = docRecord.id === currentDoc.id;
        return (
          <PageItem
            aria-selected={isCurrent}
            docId={docRecord.id}
            key={docRecord.id}
            duplicate
            right={
              <Menu
                contentOptions={{
                  style: { width: 237, maxWidth: '100%' },
                  align: 'end',
                  alignOffset: -4,
                  sideOffset: 8,
                }}
                items={
                  <>
                    <MenuItem
                      prefixIcon={<CalendarXmarkIcon />}
                      onClick={e => {
                        e.stopPropagation();
                        handleRemoveJournalMark(docRecord.id);
                      }}
                      data-testid="journal-conflict-remove-mark"
                    >
                      {t[
                        'com.affine.page-properties.property.journal-remove'
                      ]()}
                    </MenuItem>
                    <MenuSeparator />
                    <MoveToTrash
                      onSelect={() => handleOpenTrashModal(docRecord)}
                    />
                  </>
                }
              >
                <IconButton
                  data-testid="journal-conflict-edit"
                  icon={<EditIcon />}
                />
              </Menu>
            }
          />
        );
      })}
      {children}
    </div>
  );
};
const JournalConflictBlock = ({ date }: JournalBlockProps) => {
  const t = useI18n();
  const docRecordList = useService(DocsService).list;
  const journalService = useService(JournalService);
  const dateString = date.format('YYYY-MM-DD');
  const docs = useLiveData(
    useMemo(
      () => journalService.journalsByDate$(dateString),
      [dateString, journalService]
    )
  );
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
