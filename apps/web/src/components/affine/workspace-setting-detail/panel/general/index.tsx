import { Button, toast } from '@affine/component';
import { WorkspaceAvatar } from '@affine/component/workspace-avatar';
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
import { useState } from 'react';

import { useIsWorkspaceOwner } from '../../../../../hooks/affine/use-is-workspace-owner';
import { Upload } from '../../../../pure/file-upload';
import type { PanelProps } from '../../index';
import * as style from '../../index.css';
import { WorkspaceDeleteModal } from './delete';
import { CameraIcon } from './icons';
import { WorkspaceLeave } from './leave';
import { StyledInput } from './style';

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
            width={284}
            height={38}
            value={input}
            data-testid="workspace-name-input"
            placeholder={t['Workspace Name']()}
            maxLength={50}
            minLength={0}
            onChange={newName => {
              setInput(newName);
            }}
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

      {environment.isDesktop && (
        <div className={style.row}>
          <div className={style.col}>
            <div className={style.settingItemLabel}>
              {t['Storage Folder']()}
            </div>
            <div className={style.settingItemLabelHint}>
              {t['Storage Folder Hint']()}
            </div>
          </div>

          <div className={style.col}>
            <div
              className={style.storageTypeWrapper}
              onClick={() => {
                if (environment.isDesktop) {
                  window.apis?.dialog.revealDBFile(workspace.id);
                }
              }}
            >
              <FolderIcon color="var(--affine-primary-color)" />
              <div className={style.storageTypeLabelWrapper}>
                <div className={style.storageTypeLabel}>
                  {t['Open folder']()}
                </div>
                <div className={style.storageTypeLabelHint}>
                  {t['Open folder hint']()}
                </div>
              </div>
              <ArrowRightSmallIcon color="var(--affine-primary-color)" />
            </div>

            <div
              data-testid="move-folder"
              className={style.storageTypeWrapper}
              onClick={async () => {
                if (await window.apis?.dialog.moveDBFile(workspace.id)) {
                  toast(t['Move folder success']());
                }
              }}
            >
              <MoveToIcon color="var(--affine-primary-color)" />
              <div className={style.storageTypeLabelWrapper}>
                <div className={style.storageTypeLabel}>
                  {t['Move folder']()}
                </div>
                <div className={style.storageTypeLabelHint}>
                  {t['Move folder hint']()}
                </div>
              </div>
              <ArrowRightSmallIcon color="var(--affine-primary-color)" />
            </div>
          </div>
          <div className={style.col}></div>
        </div>
      )}

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
