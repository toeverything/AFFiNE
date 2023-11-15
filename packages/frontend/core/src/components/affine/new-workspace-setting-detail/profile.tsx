import { FlexWrapper, Input, Wrapper } from '@affine/component';
import { pushNotificationAtom } from '@affine/component/notification-center';
import type { AffineOfficialWorkspace } from '@affine/env/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { CameraIcon } from '@blocksuite/icons';
import { Avatar } from '@toeverything/components/avatar';
import { Button } from '@toeverything/components/button';
import { useBlockSuiteWorkspaceAvatarUrl } from '@toeverything/hooks/use-block-suite-workspace-avatar-url';
import { useBlockSuiteWorkspaceName } from '@toeverything/hooks/use-block-suite-workspace-name';
import { useSetAtom } from 'jotai';
import {
  type KeyboardEvent,
  type MouseEvent,
  startTransition,
  useCallback,
  useState,
} from 'react';

import { Upload } from '../../pure/file-upload';
import * as style from './style.css';
import type { WorkspaceSettingDetailProps } from './types';

export interface ProfilePanelProps extends WorkspaceSettingDetailProps {
  workspace: AffineOfficialWorkspace;
}

export const ProfilePanel = ({ workspace, isOwner }: ProfilePanelProps) => {
  const t = useAFFiNEI18N();
  const pushNotification = useSetAtom(pushNotificationAtom);

  const [workspaceAvatar, update] = useBlockSuiteWorkspaceAvatarUrl(
    workspace.blockSuiteWorkspace
  );

  const [name, setName] = useBlockSuiteWorkspaceName(
    workspace.blockSuiteWorkspace
  );

  const [input, setInput] = useState<string>(name);

  const handleUpdateWorkspaceName = useCallback(
    (name: string) => {
      setName(name);
      pushNotification({
        title: t['Update workspace name success'](),
        type: 'success',
      });
    },
    [pushNotification, setName, t]
  );

  const handleSetInput = useCallback((value: string) => {
    startTransition(() => {
      setInput(value);
    });
  }, []);

  const handleKeyUp = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.code === 'Enter' && name !== input) {
        handleUpdateWorkspaceName(input);
      }
    },
    [handleUpdateWorkspaceName, input, name]
  );

  const handleClick = useCallback(() => {
    handleUpdateWorkspaceName(input);
  }, [handleUpdateWorkspaceName, input]);

  const handleRemoveUserAvatar = useCallback(
    async (e: MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      await update(null);
    },
    [update]
  );

  const handleUploadAvatar = useCallback(
    (file: File) => {
      update(file)
        .then(() => {
          pushNotification({
            title: 'Update workspace avatar success',
            type: 'success',
          });
        })
        .catch(error => {
          pushNotification({
            title: 'Update workspace avatar failed',
            message: error,
            type: 'error',
          });
        });
    },
    [pushNotification, update]
  );

  return (
    <div className={style.profileWrapper}>
      <Upload
        accept="image/gif,image/jpeg,image/jpg,image/png,image/svg"
        fileChange={handleUploadAvatar}
        data-testid="upload-avatar"
        disabled={!isOwner}
      >
        <Avatar
          size={56}
          url={workspaceAvatar}
          name={name}
          colorfulFallback
          hoverIcon={isOwner ? <CameraIcon /> : undefined}
          onRemove={
            workspaceAvatar && isOwner ? handleRemoveUserAvatar : undefined
          }
          avatarTooltipOptions={{ content: t['Click to replace photo']() }}
          removeTooltipOptions={{ content: t['Remove photo']() }}
          data-testid="workspace-setting-avatar"
          removeButtonProps={{
            ['data-testid' as string]: 'workspace-setting-remove-avatar-button',
          }}
        />
      </Upload>

      <Wrapper marginLeft={20}>
        <div className={style.label}>{t['Workspace Name']()}</div>
        <FlexWrapper alignItems="center" flexGrow="1">
          <Input
            disabled={!isOwner}
            width={280}
            height={32}
            defaultValue={input}
            data-testid="workspace-name-input"
            placeholder={t['Workspace Name']()}
            maxLength={64}
            minLength={0}
            onChange={handleSetInput}
            onKeyUp={handleKeyUp}
          />
          {input === workspace.blockSuiteWorkspace.meta.name ? null : (
            <Button
              data-testid="save-workspace-name"
              onClick={handleClick}
              style={{
                marginLeft: '12px',
              }}
            >
              {t['com.affine.editCollection.save']()}
            </Button>
          )}
        </FlexWrapper>
      </Wrapper>
    </div>
  );
};
