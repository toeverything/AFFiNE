import { useJournalInfoHelper } from '@affine/core/hooks/use-journal';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import type { Page } from '@blocksuite/store';
import dayjs from 'dayjs';

import * as styles from './styles.css';

export const BlocksuiteEditorJournalDocTitle = ({ page }: { page: Page }) => {
  const { localizedJournalDate, isTodayJournal } = useJournalInfoHelper(
    page.workspace,
    page.id
  );
  const t = useAFFiNEI18N();

  // TODO: i18n
  const day = dayjs(localizedJournalDate).format('dddd');

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
