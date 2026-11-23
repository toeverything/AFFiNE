import { FlexWrapper, Input, notify, Wrapper } from '@affine/component';
import { Button } from '@affine/component/ui/button';
import { useCatchEventCallback } from '@affine/core/components/hooks/use-catch-event-hook';
import { Upload } from '@affine/core/components/pure/file-upload';
import { WorkspaceAvatar } from '@affine/core/components/workspace-avatar';
import { WorkspacePermissionService } from '@affine/core/modules/permissions';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { validateAndReduceImage } from '@affine/core/utils/reduce-image';
import { UNTITLED_WORKSPACE_NAME } from '@affine/env/constant';
import { useI18n } from '@affine/i18n';
import { CameraIcon } from '@blocksuite/icons/rc';
import { LiveData, useLiveData, useService } from '@toeverything/infra';
import type { KeyboardEvent } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { map } from 'rxjs';

import * as style from './style.css';

export const ProfilePanel = () => {
  const t = useI18n();

  const workspace = useService(WorkspaceService).workspace;
  const permissionService = useService(WorkspacePermissionService);
  const isOwner = useLiveData(permissionService.permission.isOwner$);
  useEffect(() => {
    permissionService.permission.revalidate();
  }, [permissionService]);
  const workspaceIsReady = useLiveData(
    useMemo(() => {
      return workspace
        ? LiveData.from(
            workspace.engine.doc
              .docState$(workspace.id)
              .pipe(map(v => v.ready)),
            false
          )
        : null;
    }, [workspace])
  );
  const [name, setName] = useState('');
  const currentName = useLiveData(workspace.name$);

  useEffect(() => {
    setName(currentName ?? UNTITLED_WORKSPACE_NAME);
  }, [currentName]);

  const setWorkspaceAvatar = useCallback(
    async (file: File | null) => {
      if (!workspace) {
        return;
      }
      if (!file) {
        workspace.setAvatar('');
        return;
      }
      try {
        const reducedFile = await validateAndReduceImage(file);
        const blobs = workspace.docCollection.blobSync;
        const blobId = await blobs.set(reducedFile);
        workspace.setAvatar(blobId);
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
      workspace.setName(name);
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
      notify.success({ title: t['Update workspace name success']() });
    },
    [setWorkspaceName, t]
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

  const handleRemoveUserAvatar = useCatchEventCallback(async () => {
    await setWorkspaceAvatar(null);
  }, [setWorkspaceAvatar]);

  const handleUploadAvatar = useCallback(
    (file: File) => {
      setWorkspaceAvatar(file)
        .then(() => {
          notify.success({ title: 'Update workspace avatar success' });
        })
        .catch(error => {
          notify.error({
            title: 'Update workspace avatar failed',
            message: error,
          });
        });
    },
    [setWorkspaceAvatar]
  );

  const canAdjustAvatar = workspaceIsReady && isOwner;

  return (
    <div className={style.profileWrapper}>
      <Upload
        accept="image/gif,image/jpeg,image/jpg,image/png,image/svg"
        fileChange={handleUploadAvatar}
        data-testid="upload-avatar"
        disabled={!isOwner}
      >
        <WorkspaceAvatar
          meta={workspace.meta}
          size={56}
          name={name}
          rounded={8}
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
            disabled={!workspaceIsReady || !isOwner}
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
