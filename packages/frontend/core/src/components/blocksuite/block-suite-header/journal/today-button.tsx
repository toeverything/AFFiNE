import { Button } from '@affine/component';
import { useJournalRouteHelper } from '@affine/core/components/hooks/use-journal';
import { useI18n } from '@affine/i18n';
import type { DocCollection } from '@blocksuite/affine/store';
import { useCallback } from 'react';

export interface JournalTodayButtonProps {
  docCollection: DocCollection;
}

export const JournalTodayButton = ({
  docCollection,
}: JournalTodayButtonProps) => {
  const t = useI18n();
  const journalHelper = useJournalRouteHelper(docCollection);

  const onToday = useCallback(() => {
    journalHelper.openToday();
  }, [journalHelper]);

  return (
    <Button
      size="default"
      onClick={onToday}
      style={{ height: 32, padding: '0px 8px' }}
    >
      {t['com.affine.today']()}
    </Button>
  );
};
