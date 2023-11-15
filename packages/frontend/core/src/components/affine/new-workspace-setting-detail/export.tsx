import { pushNotificationAtom } from '@affine/component/notification-center';
import { SettingRow } from '@affine/component/setting-components';
import type { AffineOfficialWorkspace } from '@affine/env/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { Button } from '@toeverything/components/button';
import { useAsyncCallback } from '@toeverything/hooks/affine-async-hooks';
import type { SaveDBFileResult } from '@toeverything/infra/type';
import { useSetAtom } from 'jotai';
import { useState } from 'react';
import type { Doc } from 'yjs';
import { encodeStateAsUpdate } from 'yjs';

async function syncBlobsToSqliteDb(workspace: AffineOfficialWorkspace) {
  if (window.apis && environment.isDesktop) {
    const bs = workspace.blockSuiteWorkspace.blob;
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

async function syncDocsToSqliteDb(workspace: AffineOfficialWorkspace) {
  if (window.apis && environment.isDesktop) {
    const workspaceId = workspace.blockSuiteWorkspace.doc.guid;
    const syncDoc = async (doc: Doc) => {
      await window.apis.db.applyDocUpdate(
        workspace.id,
        encodeStateAsUpdate(doc),
        doc.guid === workspaceId ? undefined : doc.guid
      );
      await Promise.all([...doc.subdocs].map(subdoc => syncDoc(subdoc)));
    };

    return syncDoc(workspace.blockSuiteWorkspace.doc);
  }
}

interface ExportPanelProps {
  workspace: AffineOfficialWorkspace;
}

export const ExportPanel = ({ workspace }: ExportPanelProps) => {
  const workspaceId = workspace.id;
  const t = useAFFiNEI18N();
  const [syncing, setSyncing] = useState(false);
  const pushNotification = useSetAtom(pushNotificationAtom);
  const onExport = useAsyncCallback(async () => {
    if (syncing) {
      return;
    }
    setSyncing(true);
    try {
      await syncBlobsToSqliteDb(workspace);
      await syncDocsToSqliteDb(workspace);
      const result: SaveDBFileResult =
        await window.apis?.dialog.saveDBFileAs(workspaceId);
      if (result?.error) {
        throw new Error(result.error);
      } else if (!result?.canceled) {
        pushNotification({
          type: 'success',
          title: t['Export success'](),
        });
      }
    } catch (e: any) {
      pushNotification({
        type: 'error',
        title: t['Export failed'](),
        message: e.message,
      });
    } finally {
      setSyncing(false);
    }
  }, [pushNotification, syncing, t, workspace, workspaceId]);

  return (
    <SettingRow name={t['Export']()} desc={t['Export Description']()}>
      <Button
        data-testid="export-affine-backup"
        onClick={onExport}
        disabled={syncing}
      >
        {t['Export']()}
      </Button>
    </SettingRow>
  );
};
