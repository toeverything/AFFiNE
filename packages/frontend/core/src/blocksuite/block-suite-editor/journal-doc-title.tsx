import { JournalService } from '@affine/core/modules/journal';
import { i18nTime, useI18n } from '@affine/i18n';
import type { Store } from '@blocksuite/affine/store';
import { useLiveData, useService } from '@toeverything/infra';
import dayjs from 'dayjs';

import * as styles from './styles.css';

export const BlocksuiteEditorJournalDocTitle = ({ page }: { page: Store }) => {
  const journalService = useService(JournalService);
  const journalDateStr = useLiveData(journalService.journalDate$(page.id));
  const journalDate = journalDateStr ? dayjs(journalDateStr) : null;
  const isTodayJournal = useLiveData(journalService.journalToday$(page.id));
  const localizedJournalDate = i18nTime(journalDateStr, {
    absolute: { accuracy: 'day' },
  });
  const t = useI18n();

  // TODO(catsjuice): i18n
  const day = journalDate?.format('dddd') ?? null;

  return (
    <div className="doc-title-container" data-testid="journal-title">
      <span data-testid="date">{localizedJournalDate}</span>
      {isTodayJournal ? (
        <span className={styles.titleTodayTag} data-testid="date-today-label">
          {t['com.affine.today']()}
        </span>
      ) : (
        <span className={styles.titleDayTag}>{day}</span>
      )}
    </div>
  );
};
