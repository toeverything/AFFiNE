import { MenuItem } from '@affine/component/app-sidebar';
import { currentPageIdAtom } from '@affine/core/atoms/mode';
import {
  useJournalHelper,
  useJournalInfoHelper,
} from '@affine/core/hooks/use-journal';
import type { BlockSuiteWorkspace } from '@affine/core/shared';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { TodayIcon, TomorrowIcon, YesterdayIcon } from '@blocksuite/icons';
import { useAtomValue } from 'jotai';
import { useParams } from 'react-router-dom';

interface AppSidebarJournalButtonProps {
  workspace: BlockSuiteWorkspace;
}

export const AppSidebarJournalButton = ({
  workspace,
}: AppSidebarJournalButtonProps) => {
  const t = useAFFiNEI18N();
  const currentPageId = useAtomValue(currentPageIdAtom);
  const { openToday } = useJournalHelper(workspace);
  const { journalDate, isJournal } = useJournalInfoHelper(
    workspace,
    currentPageId
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
    <MenuItem active={isJournalActive} onClick={openToday} icon={<Icon />}>
      {t['com.affine.journal.app-sidebar-title']()}
    </MenuItem>
  );
};
