import { Button } from '@affine/component';
import { useJournalRouteHelper } from '@affine/core/hooks/use-journal';
import type { BlockSuiteWorkspace } from '@affine/core/shared';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useCallback } from 'react';

export interface JournalTodayButtonProps {
  workspace: BlockSuiteWorkspace;
}

export const JournalTodayButton = ({ workspace }: JournalTodayButtonProps) => {
  const t = useAFFiNEI18N();
  const journalHelper = useJournalRouteHelper(workspace);

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
