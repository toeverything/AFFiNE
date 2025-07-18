import { DocDisplayMetaService } from '@affine/core/modules/doc-display-meta';
import { FeatureFlagService } from '@affine/core/modules/feature-flag';
import { JournalService } from '@affine/core/modules/journal';
import { WorkbenchService } from '@affine/core/modules/workbench';
import { TodayIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback } from 'react';

import { TabItem } from './tab-item';
import type { AppTabCustomFCProps } from './type';

export const AppTabJournal = ({ tab }: AppTabCustomFCProps) => {
  const workbench = useService(WorkbenchService).workbench;
  const location = useLiveData(workbench.location$);
  const journalService = useService(JournalService);
  const docDisplayMetaService = useService(DocDisplayMetaService);
  const featureFlagService = useService(FeatureFlagService);
  const isTwoStepJournalConfirmationEnabled = useLiveData(
    featureFlagService.flags.enable_two_step_journal_confirmation.$
  );

  const maybeDocId = location.pathname.split('/')[1];
  const journalDate = useLiveData(journalService.journalDate$(maybeDocId));
  const JournalIcon = useLiveData(docDisplayMetaService.icon$(maybeDocId));

  const handleOpenToday = useCallback(() => {
    if (isTwoStepJournalConfirmationEnabled) {
      workbench.open('/journals', { at: 'active' });
    } else {
      const docId = journalService.ensureJournalByDate(new Date()).id;
      workbench.openDoc({ docId, fromTab: 'true' }, { at: 'active' });
    }
  }, [workbench, journalService, isTwoStepJournalConfirmationEnabled]);

  const Icon = journalDate ? JournalIcon : TodayIcon;

  return (
    <TabItem onClick={handleOpenToday} id={tab.key} label="Journal">
      <Icon />
    </TabItem>
  );
};
