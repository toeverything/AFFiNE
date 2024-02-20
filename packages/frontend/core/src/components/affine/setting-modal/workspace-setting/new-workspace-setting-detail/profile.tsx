import { FlexWrapper, Input, Wrapper } from '@affine/component';
import { pushNotificationAtom } from '@affine/component/notification-center';
import { Avatar } from '@affine/component/ui/avatar';
import { Button } from '@affine/component/ui/button';
import { Upload } from '@affine/core/components/pure/file-upload';
import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import { useWorkspaceBlobObjectUrl } from '@affine/core/hooks/use-workspace-blob';
import { useWorkspaceStatus } from '@affine/core/hooks/use-workspace-status';
import { validateAndReduceImage } from '@affine/core/utils/reduce-image';
import { UNTITLED_WORKSPACE_NAME } from '@affine/env/constant';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { CameraIcon } from '@blocksuite/icons';
import type { Workspace } from '@toeverything/infra';
import { SyncPeerStep } from '@toeverything/infra';
import { useSetAtom } from 'jotai';
import {
  type KeyboardEvent,
  type MouseEvent,
  useCallback,
  useEffect,
  useState,
} from 'react';

import * as style from './style.css';
import type { WorkspaceSettingDetailProps } from './types';

export interface ProfilePanelProps extends WorkspaceSettingDetailProps {
  workspace: Workspace | null;
}

export const ProfilePanel = ({ isOwner, workspace }: ProfilePanelProps) => {
  const t = useAFFiNEI18N();
  const pushNotification = useSetAtom(pushNotificationAtom);

  const workspaceIsLoading =
    useWorkspaceStatus(
      workspace,
      status =>
        !status.engine.sync.local ||
        status.engine.sync.local?.step <= SyncPeerStep.LoadingRootDoc
    ) ?? true;

  const [avatarBlob, setAvatarBlob] = useState<string | null>(null);
  const [name, setName] = useState('');

  const avatarUrl = useWorkspaceBlobObjectUrl(workspace?.meta, avatarBlob);

  useEffect(() => {
    if (workspace?.blockSuiteWorkspace) {
      setAvatarBlob(workspace.blockSuiteWorkspace.meta.avatar ?? null);
      setName(
        workspace.blockSuiteWorkspace.meta.name ?? UNTITLED_WORKSPACE_NAME
      );
      const dispose = workspace.blockSuiteWorkspace.meta.commonFieldsUpdated.on(
        () => {
          setAvatarBlob(workspace.blockSuiteWorkspace.meta.avatar ?? null);
          setName(
            workspace.blockSuiteWorkspace.meta.name ?? UNTITLED_WORKSPACE_NAME
          );
        }
      );
      return () => {
        dispose.dispose();
      };
    } else {
      setAvatarBlob(null);
      setName(UNTITLED_WORKSPACE_NAME);
    }
    return;
  }, [workspace]);

  const setWorkspaceAvatar = useCallback(
    async (file: File | null) => {
      if (!workspace) {
        return;
      }
      if (!file) {
        workspace.blockSuiteWorkspace.meta.setAvatar('');
        return;
      }
      try {
        const reducedFile = await validateAndReduceImage(file);
        const blobs = workspace.blockSuiteWorkspace.blob;
        const blobId = await blobs.set(reducedFile);
        workspace.blockSuiteWorkspace.meta.setAvatar(blobId);
      } catch (error) {
        console.error(error);
        throw error;
      }
    },
    [workspace]
  );

  const setWorkspaceName = useCallback(
    (name: string) => {
      if (!workspace) {
        return;
      }
      workspace.blockSuiteWorkspace.meta.setName(name);
    },
    [workspace]
  );

  const [input, setInput] = useState<string>('');
  useEffect(() => {
    setInput(name);
  }, [name]);

  const handleUpdateWorkspaceName = useCallback(
    (name: string) => {
      setWorkspaceName(name);
      pushNotification({
        title: t['Update workspace name success'](),
        type: 'success',
      });
    },
    [pushNotification, setWorkspaceName, t]
  );

  const handleSetInput = useCallback((value: string) => {
    setInput(value);
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

  const handleRemoveUserAvatar = useAsyncCallback(
    async (e: MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      await setWorkspaceAvatar(null);
    },
    [setWorkspaceAvatar]
  );

  const handleUploadAvatar = useCallback(
    (file: File) => {
      setWorkspaceAvatar(file)
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
    [pushNotification, setWorkspaceAvatar]
  );

  const canAdjustAvatar = !workspaceIsLoading && avatarUrl && isOwner;

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
          url={avatarUrl}
          name={name}
          colorfulFallback
          hoverIcon={isOwner ? <CameraIcon /> : undefined}
          onRemove={canAdjustAvatar ? handleRemoveUserAvatar : undefined}
          avatarTooltipOptions={
            canAdjustAvatar
              ? { content: t['Click to replace photo']() }
              : undefined
          }
          removeTooltipOptions={
            canAdjustAvatar ? { content: t['Remove photo']() } : undefined
          }
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
            disabled={workspaceIsLoading || !isOwner}
            value={input}
            style={{ width: 280, height: 32 }}
            data-testid="workspace-name-input"
            placeholder={t['Workspace Name']()}
            maxLength={64}
            minLength={0}
            onChange={handleSetInput}
            onKeyUp={handleKeyUp}
          />
          {input === name ? null : (
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
