import { Button, toast, Wrapper } from '@affine/component';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { rootCurrentWorkspaceIdAtom } from '@affine/workspace/atom';
import { useAtomValue } from 'jotai';

export const ExportPanel = () => {
  const id = useAtomValue(rootCurrentWorkspaceIdAtom);
  const t = useAFFiNEI18N();
  return (
    <>
      <Wrapper marginBottom="42px"> {t['Export Description']()}</Wrapper>
      <Button
        type="light"
        shape="circle"
        disabled={
          !environment.isDesktop || !id || !runtimeConfig.enableSQLiteProvider
        }
        data-testid="export-affine-backup"
        onClick={async () => {
          if (id) {
            const result = await window.apis?.dialog.saveDBFileAs(id);
            if (result?.error) {
              // @ts-expect-error: result.error is dynamic
              toast(t[result.error]());
            } else if (!result?.canceled) {
              toast(t['Export success']());
            }
          }
        }}
      >
        {t['Export AFFiNE backup file']()}
      </Button>
    </>
  );
};
