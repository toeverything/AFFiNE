import { Button, toast } from '@affine/component';
import { SettingRow } from '@affine/component/setting-components';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import type { FC } from 'react';

import type { AffineOfficialWorkspace } from '../../../shared';

export const ExportPanel: FC<{
  workspace: AffineOfficialWorkspace;
}> = ({ workspace }) => {
  const workspaceId = workspace.id;
  const t = useAFFiNEI18N();
  return (
    <>
      <SettingRow name={t['Export']()} desc={t['Export Description']()}>
        <Button
          size="small"
          data-testid="export-affine-backup"
          onClick={async () => {
            const result = await window.apis?.dialog.saveDBFileAs(workspaceId);
            if (result?.error) {
              // @ts-expect-error: result.error is dynamic
              toast(t[result.error]());
            } else if (!result?.canceled) {
              toast(t['Export success']());
            }
          }}
        >
          {t['Export']()}
        </Button>
      </SettingRow>
    </>
  );
};
