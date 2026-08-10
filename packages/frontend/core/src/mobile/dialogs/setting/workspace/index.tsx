import { notify } from '@affine/component';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { WorkspaceAvatar } from '@affine/core/components/workspace-avatar';
import { WorkspacePermissionService } from '@affine/core/modules/permissions';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { validateAndReduceImage } from '@affine/core/utils/reduce-image';
import { UNTITLED_WORKSPACE_NAME } from '@affine/env/constant';
import { useI18n } from '@affine/i18n';
import { ArrowRightSmallIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { RenameDialog } from '../../../components/rename';
import { SettingGroup } from '../group';
import { RowLayout } from '../row.layout';
import { DeleteLeaveWorkspace } from './delete-workspace';

const AVATAR_ACCEPT = 'image/gif,image/jpeg,image/jpg,image/png,image/svg';

export const WorkspaceGroup = () => {
  const t = useI18n();
  const workspace = useService(WorkspaceService).workspace;
  const permissionService = useService(WorkspacePermissionService);

  const isOwner = useLiveData(permissionService.permission.isOwner$);
  const name = useLiveData(workspace.name$) ?? UNTITLED_WORKSPACE_NAME;
  const avatar = useLiveData(workspace.avatar$);

  const [renameOpen, setRenameOpen] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    permissionService.permission.revalidate();
  }, [permissionService]);

  const openRename = useCallback(() => {
    setRenameOpen(true);
  }, []);

  const handleRename = useCallback(
    (newName: string) => {
      workspace.setName(newName);
      notify.success({ title: t['Update workspace name success']() });
    },
    [t, workspace]
  );

  const openAvatarPicker = useCallback(() => {
    avatarInputRef.current?.click();
  }, []);

  const handleAvatarChange = useAsyncCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) {
        return;
      }
      try {
        const reduced = await validateAndReduceImage(file);
        const blobId = await workspace.docCollection.blobSync.set(reduced);
        workspace.setAvatar(blobId);
      } catch (error) {
        console.error(error);
        notify.error({
          title: t['com.affine.error.unexpected-error.title'](),
          message: error instanceof Error ? error.message : undefined,
        });
      }
    },
    [t, workspace]
  );

  const removeAvatar = useCallback(() => {
    workspace.setAvatar('');
  }, [workspace]);

  return (
    <SettingGroup title={t['com.affine.settings.workspace']()}>
      <RowLayout
        label={t['Image']()}
        onClick={isOwner ? openAvatarPicker : undefined}
      >
        <WorkspaceAvatar
          meta={workspace.meta}
          size={28}
          rounded={6}
          name={name}
          colorfulFallback
        />
        {isOwner ? <ArrowRightSmallIcon fontSize={22} /> : null}
        <input
          ref={avatarInputRef}
          type="file"
          accept={AVATAR_ACCEPT}
          style={{ display: 'none' }}
          onChange={handleAvatarChange}
        />
      </RowLayout>
      {isOwner && avatar ? (
        <RowLayout label={t['Remove photo']()} onClick={removeAvatar} />
      ) : null}
      <RowLayout
        label={t['Workspace Name']()}
        onClick={isOwner ? openRename : undefined}
      >
        {name}
        {isOwner ? <ArrowRightSmallIcon fontSize={22} /> : null}
      </RowLayout>
      <DeleteLeaveWorkspace />
      <RenameDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        title={t['Workspace Name']()}
        initialName={name}
        confirmText={t['Rename']()}
        onConfirm={handleRename}
      />
    </SettingGroup>
  );
};
