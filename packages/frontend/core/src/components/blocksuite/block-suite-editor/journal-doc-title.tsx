import { useJournalInfoHelper } from '@affine/core/hooks/use-journal';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import type { Doc } from '@blocksuite/store';

import * as styles from './styles.css';

export const BlocksuiteEditorJournalDocTitle = ({ page }: { page: Doc }) => {
  const { localizedJournalDate, isTodayJournal, journalDate } =
    useJournalInfoHelper(page.collection, page.id);
  const t = useAFFiNEI18N();

  // TODO: i18n
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
