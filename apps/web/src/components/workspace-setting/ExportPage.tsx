import { Wrapper } from '@affine/component';
import { Button } from '@affine/component';
import { WorkspaceUnit } from '@affine/datacenter';
import { useTranslation } from '@affine/i18n';
export const ExportPage = ({ workspace }: { workspace: WorkspaceUnit }) => {
  const { t } = useTranslation();
  console.log(workspace);
  return (
    <>
      <Wrapper marginBottom="32px"> {t('Export Description')}</Wrapper>
      <Button type="light" shape="circle" disabled>
        {t('Export AFFiNE backup file')}
      </Button>
    </>
  );
};
