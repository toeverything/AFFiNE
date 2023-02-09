import { WorkspaceUnit } from '@affine/datacenter';
import { useTranslation } from '@affine/i18n';
import { Wrapper } from '@/ui/layout';
import { Button } from '@/ui/button';
export const ExportPage = ({ workspace }: { workspace: WorkspaceUnit }) => {
  const { t } = useTranslation();
  console.log(workspace);
  return (
    <>
      <Wrapper marginBottom="32px"> {t('Export Description')}</Wrapper>
      <Button type="light" shape="circle" disabled>
        {t('Export AFFINE backup file')}
      </Button>
    </>
  );
};
