import { Button, toast, Wrapper } from '@affine/component';
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
        onClick={async () => {
          if (id && (await window.apis?.dialog.saveDBFileAs(id))) {
            toast(t('Export success'));
          }
        }}
      >
        {t('Export AFFiNE backup file')}
      </Button>
    </>
  );
};
