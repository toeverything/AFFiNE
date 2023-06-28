import { Button, toast } from '@affine/component';
import { WorkspaceAvatar } from '@affine/component/workspace-avatar';
import { config } from '@affine/env';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import {
  ArrowRightSmallIcon,
  DeleteIcon,
  FolderIcon,
  MoveToIcon,
  SaveIcon,
} from '@blocksuite/icons';
import { useBlockSuiteWorkspaceAvatarUrl } from '@toeverything/hooks/use-block-suite-workspace-avatar-url';
import { useBlockSuiteWorkspaceName } from '@toeverything/hooks/use-block-suite-workspace-name';
import clsx from 'clsx';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';

import { useIsWorkspaceOwner } from '../../../../../hooks/affine/use-is-workspace-owner';
import { Upload } from '../../../../pure/file-upload';
import type { PanelProps } from '../../index';
import * as style from '../../index.css';
import { WorkspaceDeleteModal } from './delete';
import { CameraIcon } from './icons';
import { WorkspaceLeave } from './leave';
import { StyledInput } from './style';

const useShowOpenDBFile = (workspaceId: string) => {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (
      window.apis &&
      window.events &&
      environment.isDesktop &&
      config.enableSQLiteProvider
    ) {
      window.apis.workspace
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

export const GeneralPanel: React.FC<PanelProps> = ({
  workspace,
  onDeleteWorkspace,
}) => {
  const [showDelete, setShowDelete] = useState<boolean>(false);
  const [showLeave, setShowLeave] = useState<boolean>(false);
  const [name, setName] = useBlockSuiteWorkspaceName(
    workspace.blockSuiteWorkspace
  );
  const [input, setInput] = useState<string>(name);
  const isOwner = useIsWorkspaceOwner(workspace);
  const t = useAFFiNEI18N();

  const handleUpdateWorkspaceName = (name: string) => {
    setName(name);
    toast(t['Update workspace name success']());
  };

  const [, update] = useBlockSuiteWorkspaceAvatarUrl(
    workspace.blockSuiteWorkspace
  );

  return (
    <>
      <div data-testid="avatar-row" className={style.row}>
        <div className={style.col}>
          <div className={style.settingItemLabel}>
            {t['Workspace Avatar']()}
          </div>
          <div className={style.settingItemLabelHint}>
            {t['Change avatar hint']()}
          </div>
        </div>
        <div className={clsx(style.col)}>
          <div className={style.avatar[isOwner ? 'enabled' : 'disabled']}>
            {isOwner ? (
              <Upload
                accept="image/gif,image/jpeg,image/jpg,image/png,image/svg"
                fileChange={update}
                data-testid="upload-avatar"
              >
                <>
                  <div className="camera-icon">
                    <CameraIcon></CameraIcon>
                  </div>
                  <WorkspaceAvatar size={72} workspace={workspace} />
                </>
              </Upload>
            ) : (
              <WorkspaceAvatar size={72} workspace={workspace} />
            )}
          </div>
        </div>
        <div className={clsx(style.col)}></div>
      </div>

      <div data-testid="workspace-name-row" className={style.row}>
        <div className={style.col}>
          <div className={style.settingItemLabel}>{t['Workspace Name']()}</div>
          <div className={style.settingItemLabelHint}>
            {t['Change workspace name hint']()}
          </div>
        </div>

        <div className={style.col}>
          <StyledInput
            height={38}
            value={input}
            data-testid="workspace-name-input"
            placeholder={t['Workspace Name']()}
            maxLength={64}
            minLength={0}
            onChange={setInput}
          ></StyledInput>
        </div>

        <div className={style.col}>
          <Button
            type="light"
            size="middle"
            data-testid="save-workspace-name"
            icon={<SaveIcon />}
            disabled={input === workspace.blockSuiteWorkspace.meta.name}
            onClick={() => {
              handleUpdateWorkspaceName(input);
            }}
          >
            {t['Save']()}
          </Button>
        </div>
      </div>
      {environment.isDesktop && config.enableSQLiteProvider ? (
        <DesktopClientOnly workspaceId={workspace.id} />
      ) : null}
      <div className={style.row}>
        <div className={style.col}>
          <div className={style.settingItemLabel}>
            {t['Delete Workspace']()}
          </div>
          <div className={style.settingItemLabelHint}>
            {t['Delete Workspace Label Hint']()}
          </div>
        </div>

        <div className={style.col}></div>
        <div className={style.col}>
          {isOwner ? (
            <>
              <Button
                type="warning"
                data-testid="delete-workspace-button"
                size="middle"
                icon={<DeleteIcon />}
                onClick={() => {
                  setShowDelete(true);
                }}
              >
                {t['Delete']()}
              </Button>
              <WorkspaceDeleteModal
                onDeleteWorkspace={onDeleteWorkspace}
                open={showDelete}
                onClose={() => {
                  setShowDelete(false);
                }}
                workspace={workspace}
              />
            </>
          ) : (
            <>
              <Button
                type="warning"
                size="middle"
                onClick={() => {
                  setShowLeave(true);
                }}
              >
                {t['Leave']()}
              </Button>
              <WorkspaceLeave
                open={showLeave}
                onClose={() => {
                  setShowLeave(false);
                }}
              />
            </>
          )}
        </div>
      </div>
    </>
  );
};

function DesktopClientOnly({ workspaceId }: { workspaceId: string }) {
  const t = useAFFiNEI18N();
  const showOpenFolder = useShowOpenDBFile(workspaceId);
  const onRevealDBFile = useCallback(() => {
    if (environment.isDesktop && config.enableSQLiteProvider) {
      window.apis?.dialog.revealDBFile(workspaceId).catch(err => {
        console.error(err);
      });
    }
  }, [workspaceId]);
  const [moveToInProgress, setMoveToInProgress] = useState<boolean>(false);
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
  const openFolderNode = showOpenFolder ? (
    <div className={style.storageTypeWrapper} onClick={onRevealDBFile}>
      <FolderIcon color="var(--affine-primary-color)" />
      <div className={style.storageTypeLabelWrapper}>
        <div className={style.storageTypeLabel}>{t['Open folder']()}</div>
        <div className={style.storageTypeLabelHint}>
          {t['Open folder hint']()}
        </div>
      </div>
      <ArrowRightSmallIcon color="var(--affine-primary-color)" />
    </div>
  ) : null;
  return (
    <div className={style.row}>
      <div className={style.col}>
        <div className={style.settingItemLabel}>{t['Storage Folder']()}</div>
        <div className={style.settingItemLabelHint}>
          {t['Storage Folder Hint']()}
        </div>
      </div>

      <div className={style.col}>
        {openFolderNode}

        <div
          data-testid="move-folder"
          data-disabled={moveToInProgress}
          className={style.storageTypeWrapper}
          onClick={handleMoveTo}
        >
          <MoveToIcon color="var(--affine-primary-color)" />
          <div className={style.storageTypeLabelWrapper}>
            <div className={style.storageTypeLabel}>{t['Move folder']()}</div>
            <div className={style.storageTypeLabelHint}>
              {t['Move folder hint']()}
            </div>
          </div>
          <ArrowRightSmallIcon color="var(--affine-primary-color)" />
        </div>
      </div>
      <div className={style.col}></div>
    </div>
  );
}
