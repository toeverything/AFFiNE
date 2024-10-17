import { Checkbox, DatePicker, Menu, PropertyValue } from '@affine/component';
import { JournalService } from '@affine/core/modules/journal';
import { WorkbenchService } from '@affine/core/modules/workbench';
import { ViewService } from '@affine/core/modules/workbench/services/view';
import { i18nTime, useI18n } from '@affine/i18n';
import {
  DocService,
  useLiveData,
  useService,
  useServiceOptional,
} from '@toeverything/infra';
import dayjs from 'dayjs';
import { useCallback, useEffect, useMemo, useState } from 'react';

import * as styles from './journal.css';

export const JournalValue = () => {
  const t = useI18n();

  const journalService = useService(JournalService);
  const doc = useService(DocService).doc;
  const journalDate = useLiveData(journalService.journalDate$(doc.id));
  const checked = !!journalDate;

  const [selectedDate, setSelectedDate] = useState(
    dayjs().format('YYYY-MM-DD')
  );
  const [showDatePicker, setShowDatePicker] = useState(false);
  const displayDate = useMemo(
    () =>
      i18nTime(selectedDate, {
        absolute: { accuracy: 'day' },
      }),
    [selectedDate]
  );
  const docs = useLiveData(
    useMemo(
      () => journalService.journalsByDate$(selectedDate),
      [journalService, selectedDate]
    )
  );
  const conflict = docs.length > 1;

  useEffect(() => {
    if (journalDate) setSelectedDate(journalDate);
  }, [journalDate]);

  const handleDateSelect = useCallback(
    (day: string) => {
      const date = dayjs(day).format('YYYY-MM-DD');
      setSelectedDate(date);
      journalService.setJournalDate(doc.id, date);
    },
    [journalService, doc.id]
  );

  const handleCheck = useCallback(
    (_: unknown, v: boolean) => {
      if (!v) {
        journalService.removeJournalDate(doc.id);
      } else {
        handleDateSelect(selectedDate);
      }
    },
    [handleDateSelect, journalService, doc.id, selectedDate]
  );

  const workbench = useService(WorkbenchService).workbench;
  const activeView = useLiveData(workbench.activeView$);
  const view = useServiceOptional(ViewService)?.view ?? activeView;

  const handleOpenDuplicate = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      workbench.openSidebar();
      view.activeSidebarTab('journal');
    },
    [view, workbench]
  );

  const toggle = useCallback(() => {
    handleCheck(null, !checked);
  }, [checked, handleCheck]);

  return (
    <PropertyValue className={styles.property} onClick={toggle}>
      <div className={styles.root}>
        <Checkbox
          className={styles.checkbox}
          checked={checked}
          onChange={handleCheck}
        />
        {checked ? (
          <Menu
            contentOptions={{
              onClick: e => e.stopPropagation(),
              sideOffset: 10,
              alignOffset: -30,
              style: { padding: 20 },
            }}
            rootOptions={{
              modal: true,
              open: showDatePicker,
              onOpenChange: setShowDatePicker,
            }}
            items={
              <DatePicker
                weekDays={t['com.affine.calendar-date-picker.week-days']()}
                monthNames={t['com.affine.calendar-date-picker.month-names']()}
                todayLabel={t['com.affine.calendar-date-picker.today']()}
                value={selectedDate}
                onChange={handleDateSelect}
              />
            }
          >
            <div data-testid="date-selector" className={styles.date}>
              {displayDate}
            </div>
          </Menu>
        ) : null}

        {checked && conflict ? (
          <div
            data-testid="conflict-tag"
            className={styles.duplicateTag}
            onClick={handleOpenDuplicate}
          >
            {t['com.affine.page-properties.property.journal-duplicated']()}
          </div>
        ) : null}
      </div>
    </PropertyValue>
  );
};
