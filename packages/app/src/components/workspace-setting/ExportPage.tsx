import { WorkspaceUnit } from '@affine/datacenter';
import { useTranslation } from '@affine/i18n';
import { Wrapper } from '@affine/component';
import { Button } from '@affine/component';
export const ExportPage = ({ workspace }: { workspace: WorkspaceUnit }) => {
  const { t } = useTranslation();
  console.log(workspace);
  return (
    <>
      <Wrapper margin="0 0 32px 0"> {t('Export Description')}</Wrapper>
      <Button type="light" shape="circle" disabled>
        {t('Export AFFINE backup file')}
      </Button>
    </>
  );
};
