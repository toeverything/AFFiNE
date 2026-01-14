import type { DateCell } from '@affine/component';
import {
  DatePicker,
  IconButton,
  Menu,
  MenuItem,
  MenuSeparator,
  Scrollable,
  useConfirmModal,
} from '@affine/component';
import { Guard } from '@affine/core/components/guard';
import { MoveToTrash } from '@affine/core/components/page-list';
import { WorkspaceServerService } from '@affine/core/modules/cloud';
import {
  type DocRecord,
  DocService,
  DocsService,
} from '@affine/core/modules/doc';
import { DocDisplayMetaService } from '@affine/core/modules/doc-display-meta';
import { IntegrationService } from '@affine/core/modules/integration';
import { JournalService } from '@affine/core/modules/journal';
import {
  ViewService,
  WorkbenchLink,
  WorkbenchService,
} from '@affine/core/modules/workbench';
import { useI18n } from '@affine/i18n';
import { CalendarXmarkIcon, EditIcon } from '@blocksuite/icons/rc';
import {
  useLiveData,
  useService,
  useServiceOptional,
} from '@toeverything/infra';
import { assignInlineVars } from '@vanilla-extract/dynamic';
import clsx from 'clsx';
import dayjs from 'dayjs';
import type { HTMLAttributes, PropsWithChildren, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { CalendarEvents } from './calendar-events';
import * as styles from './journal.css';
import { JournalTemplateOnboarding } from './template-onboarding';
import { JournalTemplateSetting } from './template-setting';

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
interface PageItemProps extends Omit<
  HTMLAttributes<HTMLAnchorElement>,
  'onClick'
> {
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
  const Icon = useLiveData(docDisplayMetaService.icon$(docId));
  const title = useLiveData(docDisplayMetaService.title$(docId));

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

type DateDotType = 'journal' | 'event' | 'activity';

const mobile = environment.isMobile;
export const EditorJournalPanel = () => {
  const t = useI18n();
  const doc = useServiceOptional(DocService)?.doc;
  const workbench = useService(WorkbenchService).workbench;
  const viewService = useService(ViewService);
  const journalService = useService(JournalService);
  const calendar = useService(IntegrationService).calendar;
  const workspaceServerService = useService(WorkspaceServerService);
  const server = useLiveData(workspaceServerService.server$);
  const location = useLiveData(viewService.view.location$);
  const journalDateStr = useLiveData(
    doc ? journalService.journalDate$(doc.id) : null
  );
  const journalDate = journalDateStr ? dayjs(journalDateStr) : null;
  const isJournal = !!journalDate;
  const routeDate = useMemo(() => {
    if (!location.pathname.startsWith('/journals')) return null;
    const searchParams = new URLSearchParams(location.search);
    const rawDate = searchParams.get('date');
    return rawDate ? dayjs(rawDate) : dayjs();
  }, [location.pathname, location.search]);
  const [selectedDate, setSelectedDate] = useState(() => {
    return journalDate ?? routeDate ?? dayjs();
  });
  const [calendarCursor, setCalendarCursor] = useState(selectedDate);
  const calendarCursorMonthKey = useMemo(() => {
    return calendarCursor.format('YYYY-MM');
  }, [calendarCursor]);
  const calendarCursorMonthStart = useMemo(() => {
    return dayjs(`${calendarCursorMonthKey}-01`);
  }, [calendarCursorMonthKey]);
  const calendarCursorMonthEnd = useMemo(() => {
    return dayjs(`${calendarCursorMonthKey}-01`).endOf('month');
  }, [calendarCursorMonthKey]);
  const docRecords = useLiveData(useService(DocsService).list.docs$);
  const allJournalDates = useLiveData(journalService.allJournalDates$);
  const eventDates = useLiveData(calendar.eventDates$);
  const workspaceCalendars = useLiveData(calendar.workspaceCalendars$);
  const workspaceCalendarId = workspaceCalendars[0]?.id;

  useEffect(() => {
    if (journalDate && !journalDate.isSame(selectedDate, 'day')) {
      setSelectedDate(journalDate);
    }
  }, [journalDate, selectedDate]);

  useEffect(() => {
    if (journalDate || !routeDate) return;
    if (!routeDate.isSame(selectedDate, 'day')) {
      setSelectedDate(routeDate);
    }
  }, [journalDate, routeDate, selectedDate]);

  useEffect(() => {
    setCalendarCursor(selectedDate);
  }, [selectedDate]);

  const openJournal = useCallback(
    (date: string) => {
      const docs = journalService.journalsByDate$(date).value;
      if (docs.length > 0) {
        workbench.openDoc(docs[0].id, { at: 'active' });
      } else {
        workbench.open(`/journals?date=${date}`, { at: 'active' });
      }
    },
    [journalService, workbench]
  );

  const onDateSelect = useCallback(
    (date: string) => {
      if (dayjs(date).isSame(selectedDate, 'day')) return;
      setSelectedDate(dayjs(date));
      openJournal(date);
    },
    [openJournal, selectedDate]
  );

  const docActivityDates = useMemo(() => {
    const dates = new Set<string>();
    for (const docRecord of docRecords) {
      const meta = docRecord.meta$.value;
      if (meta.trash) continue;
      if (meta.createDate) {
        dates.add(dayjs(meta.createDate).format('YYYY-MM-DD'));
      }
      if (meta.updatedDate) {
        dates.add(dayjs(meta.updatedDate).format('YYYY-MM-DD'));
      }
    }
    return dates;
  }, [docRecords]);

  useEffect(() => {
    calendar.revalidateWorkspaceCalendars().catch(() => undefined);
    calendar.loadAccountCalendars().catch(() => undefined);
  }, [calendar, server]);

  useEffect(() => {
    const update = () => {
      calendar
        .revalidateEventsRange(calendarCursorMonthStart, calendarCursorMonthEnd)
        .catch(() => undefined);
    };
    update();
    const interval = setInterval(update, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [
    calendar,
    calendarCursorMonthEnd,
    calendarCursorMonthStart,
    workspaceCalendarId,
  ]);

  const getDotType = useCallback(
    (dateKey: string): DateDotType[] => {
      const dotTypes: DateDotType[] = [];
      if (allJournalDates.has(dateKey)) {
        dotTypes.push('journal');
      }
      if (eventDates.has(dateKey)) {
        dotTypes.push('event');
      }
      if (docActivityDates.has(dateKey)) {
        dotTypes.push('activity');
      }
      return dotTypes;
    },
    [allJournalDates, docActivityDates, eventDates]
  );

  const customDayRenderer = useCallback(
    (cell: DateCell) => {
      const dateKey = cell.date.format('YYYY-MM-DD');
      const dotTypes = getDotType(dateKey);
      return (
        <button
          className={styles.journalDateCell}
          data-is-date-cell
          tabIndex={cell.focused ? 0 : -1}
          data-is-today={cell.isToday}
          data-not-current-month={cell.notCurrentMonth}
          data-selected={cell.selected}
          data-is-journal={isJournal}
          data-has-journal={allJournalDates.has(dateKey)}
          data-mobile={mobile}
        >
          {cell.label}
          {!cell.selected && dotTypes.length ? (
            <div className={styles.journalDateCellDotContainer}>
              {dotTypes.map(dotType => (
                <div
                  key={dotType}
                  className={clsx(
                    styles.journalDateCellDot,
                    styles.journalDateCellDotType[dotType]
                  )}
                />
              ))}
            </div>
          ) : null}
        </button>
      );
    },
    [allJournalDates, getDotType, isJournal]
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
          value={selectedDate.format('YYYY-MM-DD')}
          onChange={onDateSelect}
          onCursorChange={setCalendarCursor}
          cellSize={34}
        />
      </div>
      <JournalTemplateOnboarding />
      <JournalConflictBlock date={selectedDate} />
      <CalendarEvents date={selectedDate} />
      <JournalDailyCountBlock date={selectedDate} />
      <JournalTemplateSetting />
    </div>
  );
};

export const sortPagesByDate = (
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
  extends PropsWithChildren, HTMLAttributes<HTMLDivElement> {
  docRecords: DocRecord[];
}
const ConflictList = ({
  docRecords,
  children,
  className,
  ...attrs
}: ConflictListProps) => {
  const t = useI18n();
  const currentDocId = useServiceOptional(DocService)?.doc.id;
  const journalService = useService(JournalService);
  const { openConfirmModal } = useConfirmModal();

  const handleOpenTrashModal = useCallback(
    (docRecord: DocRecord) => {
      openConfirmModal({
        title: t['com.affine.moveToTrash.confirmModal.title'](),
        description: t['com.affine.moveToTrash.confirmModal.description']({
          title: docRecord.title$.value || t['Untitled'](),
        }),
        cancelText: t['com.affine.confirmModal.button.cancel'](),
        confirmButtonOptions: {
          variant: 'error',
        },
        confirmText: t.Delete(),
        onConfirm: () => {
          docRecord.moveToTrash();
        },
      });
    },
    [openConfirmModal, t]
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
        const isCurrent = currentDocId ? docRecord.id === currentDocId : false;
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
                    <Guard docId={docRecord.id} permission="Doc_Update">
                      {canEdit => (
                        <MenuItem
                          prefixIcon={<CalendarXmarkIcon />}
                          onClick={e => {
                            e.stopPropagation();
                            handleRemoveJournalMark(docRecord.id);
                          }}
                          data-testid="journal-conflict-remove-mark"
                          disabled={!canEdit}
                        >
                          {t[
                            'com.affine.page-properties.property.journal-remove'
                          ]()}
                        </MenuItem>
                      )}
                    </Guard>
                    <MenuSeparator />
                    <Guard docId={docRecord.id} permission="Doc_Trash">
                      {canTrash => (
                        <MoveToTrash
                          onSelect={() => handleOpenTrashModal(docRecord)}
                          disabled={!canTrash}
                        />
                      )}
                    </Guard>
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
