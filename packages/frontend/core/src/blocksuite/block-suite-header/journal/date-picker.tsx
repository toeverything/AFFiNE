import type { WeekDatePickerHandle } from '@affine/component';
import { WeekDatePicker } from '@affine/component';
import { FeatureFlagService } from '@affine/core/modules/feature-flag';
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

  const featureFlagService = useService(FeatureFlagService);
  const isTwoStepJournalConfirmationEnabled = useLiveData(
    featureFlagService.flags.enable_two_step_journal_confirmation.$
  );

  useEffect(() => {
    if (!journalDate) return;
    setDate(journalDate.format(JOURNAL_DATE_FORMAT));
    handleRef.current?.setCursor?.(journalDate);
  }, [journalDate]);

  const openJournal = useCallback(
    (date: string) => {
      if (isTwoStepJournalConfirmationEnabled) {
        const docs = journalService.journalsByDate$(date).value;
        if (docs.length > 0) {
          workbench.openDoc(docs[0].id, { at: 'active' });
        } else {
          workbench.open(`/journals?date=${date}`, { at: 'active' });
        }
      } else {
        const doc = journalService.ensureJournalByDate(date);
        workbench.openDoc(doc.id, { at: 'active' });
      }
    },
    [isTwoStepJournalConfirmationEnabled, journalService, workbench]
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
