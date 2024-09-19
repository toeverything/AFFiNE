import { useJournalInfoHelper } from '@affine/core/components/hooks/use-journal';
import { useI18n } from '@affine/i18n';
import type { Doc } from '@blocksuite/store';

import * as styles from './styles.css';

export const BlocksuiteEditorJournalDocTitle = ({ page }: { page: Doc }) => {
  const { localizedJournalDate, isTodayJournal, journalDate } =
    useJournalInfoHelper(page.id);
  const t = useI18n();

  // TODO(catsjuice): i18n
  const day = journalDate?.format('dddd') ?? null;

  return (
    <span className="doc-title-container">
      <span>{localizedJournalDate}</span>
      {isTodayJournal ? (
        <span className={styles.titleTodayTag}>{t['com.affine.today']()}</span>
      ) : (
        <span className={styles.titleDayTag}>{day}</span>
      )}
    </span>
  );
};
