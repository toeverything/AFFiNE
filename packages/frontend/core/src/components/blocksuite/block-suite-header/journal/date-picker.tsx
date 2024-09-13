import type { WeekDatePickerHandle } from '@affine/component';
import { WeekDatePicker } from '@affine/component';
import {
  useJournalInfoHelper,
  useJournalRouteHelper,
} from '@affine/core/hooks/use-journal';
import type { Doc, DocCollection } from '@blocksuite/store';
import dayjs from 'dayjs';
import { useEffect, useRef, useState } from 'react';

export interface JournalWeekDatePickerProps {
  docCollection: DocCollection;
  page: Doc;
}

const weekStyle = { maxWidth: 800, width: '100%' };
export const JournalWeekDatePicker = ({
  docCollection,
  page,
}: JournalWeekDatePickerProps) => {
  const handleRef = useRef<WeekDatePickerHandle>(null);
  const { journalDate } = useJournalInfoHelper(docCollection, page.id);
  const { openJournal } = useJournalRouteHelper(docCollection);
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
