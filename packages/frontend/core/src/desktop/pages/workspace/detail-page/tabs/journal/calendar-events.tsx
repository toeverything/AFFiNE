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
import type ICAL from 'ical.js';
import { useEffect, useMemo, useState } from 'react';

import * as styles from './calendar-events.css';

const pad = (val?: number) => (val ?? 0).toString().padStart(2, '0');

function formatTime(start?: ICAL.Time, end?: ICAL.Time) {
  if (!start || !end) return '';
  // Use toJSDate which handles timezone conversion for us
  const startDate = start.toJSDate();
  const endDate = end.toJSDate();

  const from = `${pad(startDate.getHours())}:${pad(startDate.getMinutes())}`;
  const to = `${pad(endDate.getHours())}:${pad(endDate.getMinutes())}`;
  return from === to ? from : `${from} - ${to}`;
}

export const CalendarEvents = ({ date }: { date: Dayjs }) => {
  const calendar = useService(IntegrationService).calendar;
  const events = useLiveData(
    useMemo(() => calendar.eventsByDate$(date), [calendar, date])
  );

  useEffect(() => {
    const update = () => {
      calendar.subscriptions$.value.forEach(sub => sub.update());
    };
    update();
    const interval = setInterval(update, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [calendar]);

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
  const { url, title, startAt, endAt, allDay, date } = event;
  const [loading, setLoading] = useState(false);
  const calendar = useService(IntegrationService).calendar;
  const docsService = useService(DocsService);
  const guardService = useService(GuardService);
  const journalService = useService(JournalService);
  const workspaceService = useService(WorkspaceService);
  const { createPage } = usePageHelper(
    workspaceService.workspace.docCollection
  );
  const subscription = useLiveData(
    useMemo(() => calendar.subscription$(url), [calendar, url])
  );
  const config = useLiveData(
    useMemo(() => subscription?.config$, [subscription?.config$])
  );
  const name = useLiveData(subscription?.name$) || t['Untitled']();
  const color = config?.color || cssVarV2.button.primary;

  const handleClick = useAsyncCallback(async () => {
    if (!date || loading) return;
    const docs = journalService.journalsByDate$(
      date.format('YYYY-MM-DD')
    ).value;
    if (docs.length === 0) return;

    setLoading(true);

    try {
      for (const doc of docs) {
        const canEdit = await guardService.can('Doc_Update', doc.id);
        if (!canEdit) {
          toast(t['com.affine.no-permission']());
          continue;
        }

        const newDoc = createPage();
        await docsService.changeDocTitle(newDoc.id, title);
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
    title,
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
      <div className={styles.eventTitle}>{title}</div>
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
