import { Loading, toast, Tooltip } from '@affine/component';
import { usePageHelper } from '@affine/core/blocksuite/block-suite-page-list/utils';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { DocsService } from '@affine/core/modules/doc';
import {
  type CalendarEvent,
  IntegrationService,
} from '@affine/core/modules/integration';
import { JournalService } from '@affine/core/modules/journal';
import { GuardService } from '@affine/core/modules/permissions';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { useI18n } from '@affine/i18n';
import track from '@affine/track';
import { FullDayIcon, PeriodIcon, PlusIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { cssVarV2 } from '@toeverything/theme/v2';
import { assignInlineVars } from '@vanilla-extract/dynamic';
import type { Dayjs } from 'dayjs';
import { useMemo, useState } from 'react';

import * as styles from './calendar-events.css';

function formatTime(start?: Dayjs, end?: Dayjs) {
  if (!start || !end) return '';
  const from = start.format('HH:mm');
  const to = end.format('HH:mm');
  return from === to ? from : `${from} - ${to}`;
}

export const CalendarEvents = ({ date }: { date: Dayjs }) => {
  const calendar = useService(IntegrationService).calendar;
  const events = useLiveData(
    useMemo(() => calendar.eventsByDate$(date), [calendar, date])
  );

  return (
    <ul className={styles.list}>
      {events.map(event => (
        <CalendarEventRenderer key={event.id} event={event} />
      ))}
    </ul>
  );
};

const CalendarEventRenderer = ({ event }: { event: CalendarEvent }) => {
  const t = useI18n();
  const { title, startAt, endAt, allDay, date, calendarName, calendarColor } =
    event;
  const [loading, setLoading] = useState(false);
  const docsService = useService(DocsService);
  const guardService = useService(GuardService);
  const journalService = useService(JournalService);
  const workspaceService = useService(WorkspaceService);
  const { createPage } = usePageHelper(
    workspaceService.workspace.docCollection
  );
  const name = calendarName || t['Untitled']();
  const color = calendarColor || cssVarV2.button.primary;
  const eventTitle = title || t['Untitled']();

  const handleClick = useAsyncCallback(async () => {
    if (loading) return;
    const docs = journalService.journalsByDate$(
      date.format('YYYY-MM-DD')
    ).value;
    if (docs.length === 0) {
      toast(
        t['com.affine.integration.calendar.no-journal']({
          date: date.format('YYYY-MM-DD'),
        })
      );
      return;
    }

    setLoading(true);

    try {
      for (const doc of docs) {
        const canEdit = await guardService.can('Doc_Update', doc.id);
        if (!canEdit) {
          toast(t['com.affine.no-permission']());
          continue;
        }

        const newDoc = createPage();
        await docsService.changeDocTitle(newDoc.id, eventTitle);
        await docsService.addLinkedDoc(doc.id, newDoc.id);
      }
      track.doc.sidepanel.journal.createCalendarDocEvent();
    } finally {
      setLoading(false);
    }
  }, [
    createPage,
    date,
    docsService,
    guardService,
    journalService,
    loading,
    t,
    eventTitle,
  ]);

  return (
    <li
      style={assignInlineVars({
        [styles.primaryColor]: color,
      })}
      className={styles.event}
      data-all-day={allDay}
      onClick={handleClick}
    >
      <Tooltip
        align="start"
        side="top"
        options={{
          className: styles.nameTooltip,
          sideOffset: 12,
          alignOffset: -4,
        }}
        content={
          <div className={styles.nameTooltipContent}>
            <div className={styles.nameTooltipIcon} style={{ color }} />
            <div className={styles.nameTooltipName}>{name}</div>
          </div>
        }
      >
        <div className={styles.eventIcon}>
          {allDay ? <FullDayIcon /> : <PeriodIcon />}
        </div>
      </Tooltip>
      <div className={styles.eventTitle}>{eventTitle}</div>
      {loading ? (
        <Loading />
      ) : (
        <div className={styles.eventCaption}>
          <span className={styles.eventTime}>
            {allDay
              ? t['com.affine.integration.calendar.all-day']()
              : formatTime(startAt, endAt)}
          </span>
          <span className={styles.eventNewDoc}>
            <PlusIcon style={{ fontSize: 18 }} />
            {t['com.affine.integration.calendar.new-doc']()}
          </span>
        </div>
      )}
    </li>
  );
};
