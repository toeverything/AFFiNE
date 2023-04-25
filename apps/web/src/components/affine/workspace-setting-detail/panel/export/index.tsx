import { Button, Wrapper } from '@affine/component';
import { useTranslation } from '@affine/i18n';
import { rootCurrentWorkspaceIdAtom } from '@affine/workspace/atom';
import { useAtomValue } from 'jotai';

export const ExportPanel = () => {
  const { t } = useTranslation();
  const id = useAtomValue(rootCurrentWorkspaceIdAtom);
  return (
    <>
      <Wrapper marginBottom="42px"> {t('Export Description')}</Wrapper>
      <Button
        type="light"
        shape="circle"
        disabled={!environment.isDesktop || !id}
        onClick={() => {
          id && window.apis.openSaveDBFileDialog(id);
        }}
      >
        {t('Export AFFiNE backup file')}
      </Button>
    </>
  );
};
