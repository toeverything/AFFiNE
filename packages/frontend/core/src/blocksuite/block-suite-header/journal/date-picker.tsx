import type { WeekDatePickerHandle } from '@affine/component';
import { WeekDatePicker } from '@affine/component';
import {
  JOURNAL_DATE_FORMAT,
  JournalService,
} from '@affine/core/modules/journal';
import { WorkbenchService } from '@affine/core/modules/workbench';
import type { Store } from '@blocksuite/affine/store';
import { useLiveData, useService } from '@toeverything/infra';
import dayjs from 'dayjs';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface JournalWeekDatePickerProps {
  page: Store;
}

const weekStyle = { maxWidth: 800, width: '100%' };
export const JournalWeekDatePicker = ({ page }: JournalWeekDatePickerProps) => {
  const handleRef = useRef<WeekDatePickerHandle>(null);
  const journalService = useService(JournalService);
  const journalDateStr = useLiveData(journalService.journalDate$(page.id));
  const journalDate = journalDateStr ? dayjs(journalDateStr) : null;
  const [date, setDate] = useState(
    (journalDate ?? dayjs()).format(JOURNAL_DATE_FORMAT)
  );
  const workbench = useService(WorkbenchService).workbench;

  useEffect(() => {
    if (!journalDate) return;
    setDate(journalDate.format(JOURNAL_DATE_FORMAT));
    handleRef.current?.setCursor?.(journalDate);
  }, [journalDate]);

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

  return (
    <WeekDatePicker
      data-testid="journal-week-picker"
      handleRef={handleRef}
      style={weekStyle}
      value={date}
      onChange={openJournal}
    />
  );
};
