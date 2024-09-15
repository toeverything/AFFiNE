import { IconButton, MobileMenu } from '@affine/component';
import { useJournalInfoHelper } from '@affine/core/components/hooks/use-journal';
import { EditorJournalPanel } from '@affine/core/desktop/pages/workspace/detail-page/tabs/journal';
import { TodayIcon, TomorrowIcon, YesterdayIcon } from '@blocksuite/icons/rc';
import { useService, WorkspaceService } from '@toeverything/infra';

export const JournalIconButton = ({
  docId,
  className,
}: {
  docId: string;
  className?: string;
}) => {
  const workspace = useService(WorkspaceService).workspace;
  const { journalDate, isJournal } = useJournalInfoHelper(
    workspace.docCollection,
    docId
  );
  const Icon = journalDate
    ? journalDate.isBefore(new Date(), 'day')
      ? YesterdayIcon
      : journalDate.isAfter(new Date(), 'day')
        ? TomorrowIcon
        : TodayIcon
    : TodayIcon;

  if (!isJournal) {
    return null;
  }

  return (
    <MobileMenu
      items={<EditorJournalPanel />}
      contentOptions={{
        align: 'center',
      }}
    >
      <IconButton className={className} size={24}>
        <Icon />
      </IconButton>
    </MobileMenu>
  );
};
