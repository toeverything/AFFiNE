import { AFFiNEDatePicker } from '@affine/component';
import {
  useJournalHelper,
  useJournalInfoHelper,
} from '@affine/core/hooks/use-journal';
import { TodayIcon } from '@blocksuite/icons';
import dayjs from 'dayjs';
import { useCallback, useEffect, useState } from 'react';

import type { EditorExtension, EditorExtensionProps } from '..';
import * as styles from './journal.css';

const EditorJournalPanel = ({ workspace, page }: EditorExtensionProps) => {
  const { journalDate } = useJournalInfoHelper(page?.meta);
  const { openJournal } = useJournalHelper(workspace);
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

  return (
    <AFFiNEDatePicker
      inline
      value={date}
      onSelect={onDateSelect}
      calendarClassName={styles.calendar}
    />
  );
};

export const journalExtension: EditorExtension = {
  name: 'journal',
  icon: <TodayIcon />,
  Component: EditorJournalPanel,
};
