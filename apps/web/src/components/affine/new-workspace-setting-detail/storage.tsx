import { Button, toast } from '@affine/component';
import { SettingRow } from '@affine/component/setting-components';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { type FC, useCallback, useEffect, useState } from 'react';

import type { AffineOfficialWorkspace } from '../../../shared';

const useShowOpenDBFile = (workspaceId: string) => {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (window.apis && window.events && environment.isDesktop) {
      window.apis?.workspace
        .getMeta(workspaceId)
        .then(meta => {
          setShow(!!meta.secondaryDBPath);
        })
        .catch(err => {
          console.error(err);
        });
      return window.events.workspace.onMetaChange((newMeta: any) => {
        if (newMeta.workspaceId === workspaceId) {
          const meta = newMeta.meta;
          setShow(!!meta.secondaryDBPath);
        }
      });
    }
  }, [workspaceId]);
  return show;
};

export const StoragePanel: FC<{
  workspace: AffineOfficialWorkspace;
}> = ({ workspace }) => {
  const workspaceId = workspace.id;
  const t = useAFFiNEI18N();
  const showOpenFolder = useShowOpenDBFile(workspaceId);

  const [moveToInProgress, setMoveToInProgress] = useState<boolean>(false);
  const onRevealDBFile = useCallback(() => {
    window.apis?.dialog.revealDBFile(workspaceId).catch(err => {
      console.error(err);
    });
  }, [workspaceId]);

  const handleMoveTo = useCallback(() => {
    if (moveToInProgress) {
      return;
    }
    setMoveToInProgress(true);
    window.apis?.dialog
      .moveDBFile(workspaceId)
      .then(result => {
        if (!result?.error && !result?.canceled) {
          toast(t['Move folder success']());
        } else if (result?.error) {
          // @ts-expect-error: result.error is dynamic
          toast(t[result.error]());
        }
      })
      .catch(() => {
        toast(t['UNKNOWN_ERROR']());
      })
      .finally(() => {
        setMoveToInProgress(false);
      });
  }, [moveToInProgress, t, workspaceId]);

  if (!showOpenFolder) {
    return null;
  }
  return (
    <SettingRow
      name={t['Storage']()}
      desc={t['Storage Folder Hint']()}
      spreadCol={false}
    >
      <Button
        data-testid="move-folder"
        data-disabled={moveToInProgress}
        onClick={handleMoveTo}
      >
        {t['Move folder']()}
      </Button>
      <Button onClick={onRevealDBFile}>{t['Open folder']()}</Button>
    </SettingRow>
  );
};
