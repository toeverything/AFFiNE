import { IconButton, MobileMenu } from '@affine/component';
import { useJournalInfoHelper } from '@affine/core/components/hooks/use-journal';
import { EditorJournalPanel } from '@affine/core/desktop/pages/workspace/detail-page/tabs/journal';
import { DocDisplayMetaService } from '@affine/core/modules/doc-display-meta';
import { useLiveData, useService } from '@toeverything/infra';

export const JournalIconButton = ({
  docId,
  className,
}: {
  docId: string;
  className?: string;
}) => {
  const { isJournal } = useJournalInfoHelper(docId);

  const docDisplayMetaService = useService(DocDisplayMetaService);
  const Icon = useLiveData(
    docDisplayMetaService.icon$(docId, {
      compareDate: new Date(),
    })
  );

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
