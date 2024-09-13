import { useCatchEventCallback } from '@affine/core/hooks/use-catch-event-hook';
import {
  useJournalInfoHelper,
  useJournalRouteHelper,
} from '@affine/core/hooks/use-journal';
import { WorkbenchService } from '@affine/core/modules/workbench';
import { isNewTabTrigger } from '@affine/core/utils';
import { useI18n } from '@affine/i18n';
import { TodayIcon, TomorrowIcon, YesterdayIcon } from '@blocksuite/icons/rc';
import type { DocCollection } from '@blocksuite/store';
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
  const workbench = useService(WorkbenchService).workbench;
  const location = useLiveData(workbench.location$);
  const { openToday } = useJournalRouteHelper(docCollection);
  const { journalDate, isJournal } = useJournalInfoHelper(
    docCollection,
    location.pathname.split('/')[1]
  );

  const handleOpenToday = useCatchEventCallback(
    (e: MouseEvent) => {
      openToday(isNewTabTrigger(e));
    },
    [openToday]
  );

  const Icon =
    isJournal && journalDate
      ? journalDate.isBefore(new Date(), 'day')
        ? YesterdayIcon
        : journalDate.isAfter(new Date(), 'day')
          ? TomorrowIcon
          : TodayIcon
      : TodayIcon;

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
