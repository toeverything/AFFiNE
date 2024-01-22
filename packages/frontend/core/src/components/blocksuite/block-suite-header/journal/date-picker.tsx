import { WeekDatePicker, type WeekDatePickerHandle } from '@affine/component';
import {
  useJournalHelper,
  useJournalInfoHelper,
} from '@affine/core/hooks/use-journal';
import type { BlockSuiteWorkspace } from '@affine/core/shared';
import type { Page } from '@blocksuite/store';
import dayjs from 'dayjs';
import { useEffect, useRef, useState } from 'react';

export interface JournalWeekDatePickerProps {
  workspace: BlockSuiteWorkspace;
  page: Page;
}

const weekStyle = { maxWidth: 548, width: '100%' };
export const JournalWeekDatePicker = ({
  workspace,
  page,
}: JournalWeekDatePickerProps) => {
  const handleRef = useRef<WeekDatePickerHandle>(null);
  const { journalDate } = useJournalInfoHelper(workspace, page.id);
  const { openJournal } = useJournalHelper(workspace);
  const [date, setDate] = useState(
    (journalDate ?? dayjs()).format('YYYY-MM-DD')
  );

  useEffect(() => {
    if (!journalDate) return;
    setDate(journalDate.format('YYYY-MM-DD'));
    handleRef.current?.setCursor?.(journalDate);
  }, [journalDate]);

  return (
    <WeekDatePicker
      handleRef={handleRef}
      style={weekStyle}
      value={date}
      onChange={openJournal}
    />
  );
};
