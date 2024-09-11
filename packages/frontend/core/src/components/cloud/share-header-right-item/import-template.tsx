import { Button } from '@affine/component';
import { useNavigateHelper } from '@affine/core/hooks/use-navigate-helper';
import { useI18n } from '@affine/i18n';

export const ImportTemplateButton = ({
  workspaceId,
  docId,
  name,
}: {
  workspaceId: string;
  docId: string;
  name: string;
}) => {
  const t = useI18n();
  const { jumpToImportTemplate } = useNavigateHelper();
  return (
    <Button
      variant="primary"
      onClick={() => jumpToImportTemplate(workspaceId, docId, name)}
    >
      {t['com.affine.share-page.header.import-template']()}
    </Button>
  );
};
