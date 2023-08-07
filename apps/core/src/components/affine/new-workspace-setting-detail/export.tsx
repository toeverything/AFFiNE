import { Button, toast } from '@affine/component';
import { SettingRow } from '@affine/component/setting-components';
import { isDesktop } from '@affine/env/constant';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { type FC, useCallback } from 'react';

import type { AffineOfficialWorkspace } from '../../../shared';

async function syncBlobsToSqliteDb(workspace: AffineOfficialWorkspace) {
  if (window.apis && isDesktop) {
    const bs = workspace.blockSuiteWorkspace.blobs;
    const blobsInDb = await window.apis.db.getBlobKeys(workspace.id);
    const blobsInStorage = await bs.list();
    const blobsToSync = blobsInStorage.filter(
      blob => !blobsInDb.includes(blob)
    );

    await Promise.all(
      blobsToSync.map(async blobKey => {
        const blob = await bs.get(blobKey);
        if (blob) {
          const bin = new Uint8Array(await blob.arrayBuffer());
          await window.apis.db.addBlob(workspace.id, blobKey, bin);
        }
      })
    );
  }
}

export const ExportPanel: FC<{
  workspace: AffineOfficialWorkspace;
}> = ({ workspace }) => {
  const workspaceId = workspace.id;
  const t = useAFFiNEI18N();
  const onExport = useCallback(async () => {
    await syncBlobsToSqliteDb(workspace);
    const result = await window.apis?.dialog.saveDBFileAs(workspaceId);
    if (result?.error) {
      toast(t[result.error]());
    } else if (!result?.canceled) {
      toast(t['Export success']());
    }
  }, [t, workspace, workspaceId]);
  return (
    <>
      <SettingRow name={t['Export']()} desc={t['Export Description']()}>
        <Button data-testid="export-affine-backup" onClick={onExport}>
          {t['Export']()}
        </Button>
      </SettingRow>
    </>
  );
};
