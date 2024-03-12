import {
  useJournalInfoHelper,
  useJournalRouteHelper,
} from '@affine/core/hooks/use-journal';
import type { BlockSuiteWorkspace } from '@affine/core/shared';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { TodayIcon, TomorrowIcon, YesterdayIcon } from '@blocksuite/icons';
import { Doc, useServiceOptional } from '@toeverything/infra';
import { useParams } from 'react-router-dom';

import { MenuItem } from '../app-sidebar';

interface AppSidebarJournalButtonProps {
  workspace: BlockSuiteWorkspace;
}

export const AppSidebarJournalButton = ({
  workspace,
}: AppSidebarJournalButtonProps) => {
  const t = useAFFiNEI18N();
  const currentPage = useServiceOptional(Doc);
  const { openToday } = useJournalRouteHelper(workspace);
  const { journalDate, isJournal } = useJournalInfoHelper(
    workspace,
    currentPage?.id
  );
  const params = useParams();
  const isJournalActive = isJournal && !!params.pageId;

  const Icon =
    isJournalActive && journalDate
      ? journalDate.isBefore(new Date(), 'day')
        ? YesterdayIcon
        : journalDate.isAfter(new Date(), 'day')
          ? TomorrowIcon
          : TodayIcon
      : TodayIcon;

  return (
    <MenuItem
      data-testid="slider-bar-journals-button"
      active={isJournalActive}
      onClick={openToday}
      icon={<Icon />}
    >
      {t['com.affine.journal.app-sidebar-title']()}
    </MenuItem>
  );
};
