import { IconButton, Input, toast } from '@affine/component';
import { WorkspaceAvatar } from '@affine/component/workspace-avatar';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { CameraIcon, DoneIcon } from '@blocksuite/icons';
import { useBlockSuiteWorkspaceAvatarUrl } from '@toeverything/hooks/use-block-suite-workspace-avatar-url';
import { useBlockSuiteWorkspaceName } from '@toeverything/hooks/use-block-suite-workspace-name';
import { type FC, useCallback, useState } from 'react';

import type { AffineOfficialWorkspace } from '../../../shared';
import { Upload } from '../../pure/file-upload';
import * as style from './style.css';

export const ProfilePanel: FC<{
  workspace: AffineOfficialWorkspace;
}> = ({ workspace }) => {
  const t = useAFFiNEI18N();

  const [, update] = useBlockSuiteWorkspaceAvatarUrl(
    workspace.blockSuiteWorkspace
  );

  const [name, setName] = useBlockSuiteWorkspaceName(
    workspace.blockSuiteWorkspace
  );

  const [input, setInput] = useState<string>(name);

  const handleUpdateWorkspaceName = useCallback(
    (name: string) => {
      setName(name);
      toast(t['Update workspace name success']());
    },
    [setName, t]
  );

  return (
    <div className={style.profileWrapper}>
      <div className={style.avatarWrapper}>
        <Upload
          accept="image/gif,image/jpeg,image/jpg,image/png,image/svg"
          fileChange={update}
          data-testid="upload-avatar"
        >
          <>
            <div className="camera-icon-wrapper">
              <CameraIcon />
            </div>
            <WorkspaceAvatar
              size={56}
              workspace={workspace.blockSuiteWorkspace}
            />
          </>
        </Upload>
      </div>
      <div className={style.profileHandlerWrapper}>
        <Input
          width={280}
          height={32}
          defaultValue={input}
          data-testid="workspace-name-input"
          placeholder={t['Workspace Name']()}
          maxLength={64}
          minLength={0}
          onChange={setInput}
        />
        {input === workspace.blockSuiteWorkspace.meta.name ? null : (
          <IconButton
            size="middle"
            data-testid="save-workspace-name"
            onClick={() => {
              handleUpdateWorkspaceName(input);
            }}
            style={{
              color: 'var(--affine-primary-color)',
              marginLeft: '12px',
            }}
          >
            <DoneIcon />
          </IconButton>
        )}
      </div>
    </div>
  );
};
