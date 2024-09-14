import { Button } from '@affine/component';
import { useNavigateHelper } from '@affine/core/components/hooks/use-navigate-helper';
import { useI18n } from '@affine/i18n';

export const ImportTemplateButton = ({
  name,
  snapshotUrl,
}: {
  name: string;
  snapshotUrl: string;
}) => {
  const t = useI18n();
  const { jumpToImportTemplate } = useNavigateHelper();
  return (
    <Button
      variant="primary"
      onClick={() => jumpToImportTemplate(name, snapshotUrl)}
    >
      {t['com.affine.share-page.header.import-template']()}
    </Button>
  );
};
