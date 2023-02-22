import { Wrapper } from '@affine/component';
import { Button } from '@affine/component';
import { WorkspaceUnit } from '@affine/datacenter';
import { useTranslation } from '@affine/i18n';
export const ExportPage = ({ workspace }: { workspace: WorkspaceUnit }) => {
  console.log('workspace', workspace);

  const { t } = useTranslation();
  return (
    <>
      <Wrapper marginBottom="42px"> {t('Export Description')}</Wrapper>
      <Button type="light" shape="circle" disabled>
        {t('Export AFFiNE backup file')}
      </Button>
    </>
  );
};
