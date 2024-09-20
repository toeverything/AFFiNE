import { useCatchEventCallback } from '@affine/core/components/hooks/use-catch-event-hook';
import {
  useJournalInfoHelper,
  useJournalRouteHelper,
} from '@affine/core/components/hooks/use-journal';
import { DocDisplayMetaService } from '@affine/core/modules/doc-display-meta';
import { WorkbenchService } from '@affine/core/modules/workbench';
import { isNewTabTrigger } from '@affine/core/utils';
import { useI18n } from '@affine/i18n';
import type { DocCollection } from '@blocksuite/affine/store';
import { TodayIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { type MouseEvent } from 'react';

import { MenuItem } from '../app-sidebar';

interface AppSidebarJournalButtonProps {
  docCollection: DocCollection;
}

export const AppSidebarJournalButton = ({
  docCollection,
}: AppSidebarJournalButtonProps) => {
  const t = useI18n();
  const docDisplayMetaService = useService(DocDisplayMetaService);
  const workbench = useService(WorkbenchService).workbench;
  const location = useLiveData(workbench.location$);
  const { openToday } = useJournalRouteHelper(docCollection);
  const { isJournal } = useJournalInfoHelper(location.pathname.split('/')[1]);

  const handleOpenToday = useCatchEventCallback(
    (e: MouseEvent) => {
      openToday(isNewTabTrigger(e));
    },
    [openToday]
  );

  const JournalIcon = useLiveData(
    docDisplayMetaService.icon$(docCollection.id, {
      compareDate: new Date(),
    })
  );
  const Icon = isJournal ? JournalIcon : TodayIcon;

  return (
    <MenuItem
      data-testid="slider-bar-journals-button"
      active={isJournal}
      onClick={handleOpenToday}
      onAuxClick={handleOpenToday}
      icon={<Icon />}
    >
      {t['com.affine.journal.app-sidebar-title']()}
    </MenuItem>
  );
};
