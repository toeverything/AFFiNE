import { Button, FlexWrapper, toast, Tooltip } from '@affine/component';
import { SettingRow } from '@affine/component/setting-components';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useMemo } from 'react';
import { type FC, useCallback, useEffect, useState } from 'react';

import type { AffineOfficialWorkspace } from '../../../shared';
import * as style from './style.css';

const useDBFileSecondaryPath = (workspaceId: string) => {
  const [path, setPath] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (window.apis && window.events && environment.isDesktop) {
      window.apis?.workspace
        .getMeta(workspaceId)
        .then(meta => {
          setPath(meta.secondaryDBPath);
        })
        .catch(err => {
          console.error(err);
        });
      return window.events.workspace.onMetaChange((newMeta: any) => {
        if (newMeta.workspaceId === workspaceId) {
          const meta = newMeta.meta;
          setPath(meta.secondaryDBPath);
        }
      });
    }
  }, [workspaceId]);
  return path;
};

export const StoragePanel: FC<{
  workspace: AffineOfficialWorkspace;
}> = ({ workspace }) => {
  const workspaceId = workspace.id;
  const t = useAFFiNEI18N();
  const secondaryPath = useDBFileSecondaryPath(workspaceId);

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

  const rowContent = useMemo(
    () =>
      secondaryPath ? (
        <FlexWrapper justifyContent="space-between">
          <Tooltip
            zIndex={1000}
            content={t['com.affine.settings.storage.db-location.change-hint']()}
            placement="top-start"
          >
            <Button
              data-testid="move-folder"
              className={style.urlButton}
              size="large"
              onClick={handleMoveTo}
            >
              {secondaryPath}
            </Button>
          </Tooltip>
          <Button
            data-testid="reveal-folder"
            data-disabled={moveToInProgress}
            onClick={onRevealDBFile}
          >
            {t['Open folder']()}
          </Button>
        </FlexWrapper>
      ) : (
        <Button
          data-testid="move-folder"
          data-disabled={moveToInProgress}
          onClick={handleMoveTo}
        >
          {t['Move folder']()}
        </Button>
      ),
    [handleMoveTo, moveToInProgress, onRevealDBFile, secondaryPath, t]
  );

  return (
    <SettingRow
      name={t['Storage']()}
      desc={t[
        secondaryPath
          ? 'com.affine.settings.storage.description-alt'
          : 'com.affine.settings.storage.description'
      ]()}
      spreadCol={!secondaryPath}
    >
      {rowContent}
    </SettingRow>
  );
};
