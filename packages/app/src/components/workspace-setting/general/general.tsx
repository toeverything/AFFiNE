import {
  StyledDeleteButtonContainer,
  StyledSettingAvatar,
  StyledSettingAvatarContent,
  StyledSettingInputContainer,
} from './style';
import { StyledSettingH2 } from '../style';

import { useState } from 'react';
import { Button } from '@/ui/button';
import Input from '@/ui/input';
import { getDataCenter, Workspace, WorkspaceType } from '@affine/datacenter';
import { useAppState } from '@/providers/app-state-provider';
import { WorkspaceDetails } from '@/components/workspace-slider-bar/WorkspaceSelector/SelectorPopperContent';
import { WorkspaceDelete } from './delete';
import { Workspace as StoreWorkspace } from '@blocksuite/store';
import { debounce } from '@/utils';
import { WorkspaceLeave } from './leave';
import { Upload } from '@/components/file-upload';

export const GeneralPage = ({
  workspace,
  owner,
}: {
  workspace: Workspace;
  owner: WorkspaceDetails[string]['owner'];
  workspaces: Record<string, StoreWorkspace | null>;
}) => {
  const {
    user,
    currentWorkspace,
    workspacesMeta,
    workspaces,
    refreshWorkspacesMeta,
  } = useAppState();
  const [showDelete, setShowDelete] = useState<boolean>(false);
  const [showLeave, setShowLeave] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);
  const [workspaceName, setWorkspaceName] = useState<string>(
    workspaces[workspace.id]?.meta.name ||
      (workspace.type === WorkspaceType.Private && user ? user.name : '')
  );
  const debouncedRefreshWorkspacesMeta = debounce(() => {
    refreshWorkspacesMeta();
  }, 100);
  const isOwner = user && owner.id === user.id;
  const handleChangeWorkSpaceName = (newName: string) => {
    setWorkspaceName(newName);
    currentWorkspace?.meta.setName(newName);
    workspaces[workspace.id]?.meta.setName(newName);
    debouncedRefreshWorkspacesMeta();
  };
  const currentWorkspaceIndex = workspacesMeta.findIndex(
    meta => meta.id === workspace.id
  );
  const nextWorkSpaceId =
    currentWorkspaceIndex === workspacesMeta.length - 1
      ? workspacesMeta[currentWorkspaceIndex - 1]?.id
      : workspacesMeta[currentWorkspaceIndex + 1]?.id;
  const handleClickDelete = () => {
    setShowDelete(true);
  };
  const handleCloseDelete = () => {
    setShowDelete(false);
  };

  const handleClickLeave = () => {
    setShowLeave(true);
  };
  const handleCloseLeave = () => {
    setShowLeave(false);
  };

  const fileChange = async (file: File) => {
    setUploading(true);
    const blob = new Blob([file], { type: file.type });
    const blobId = await getDataCenter()
      .then(dc => dc.apis.uploadBlob({ blob }))
      .finally(() => {
        setUploading(false);
      });
    if (blobId) {
      currentWorkspace?.meta.setAvatar(blobId);
      workspaces[workspace.id]?.meta.setAvatar(blobId);
      setUploading(false);
      debouncedRefreshWorkspacesMeta();
    }
  };

  return workspace ? (
    <div>
      <StyledSettingH2 marginTop={56}>Workspace Avatar</StyledSettingH2>
      <StyledSettingAvatarContent>
        <StyledSettingAvatar
          alt="workspace avatar"
          src={
            workspaces[workspace.id]?.meta.avatar
              ? '/api/blob/' + workspaces[workspace.id]?.meta.avatar
              : ''
          }
        >
          {workspaces[workspace.id]?.meta.name[0]}
        </StyledSettingAvatar>
        <Upload
          accept="image/gif,image/jpeg,image/jpg,image/png,image/svg"
          fileChange={fileChange}
        >
          <Button loading={uploading}>Upload</Button>
        </Upload>
        {/* TODO: add upload logic */}
        {/* {isOwner ? (
          <StyledAvatarUploadBtn shape="round">upload</StyledAvatarUploadBtn>
        ) : null} */}
        {/* <Button shape="round">remove</Button> */}
      </StyledSettingAvatarContent>
      <StyledSettingH2 marginTop={36}>Workspace Name</StyledSettingH2>
      <StyledSettingInputContainer>
        <Input
          width={327}
          value={workspaceName}
          placeholder="Workspace Name"
          disabled={!isOwner}
          maxLength={14}
          minLength={1}
          onChange={handleChangeWorkSpaceName}
        ></Input>
      </StyledSettingInputContainer>
      <StyledSettingH2 marginTop={36}>Workspace Owner</StyledSettingH2>
      <StyledSettingInputContainer>
        <Input
          width={327}
          disabled
          value={owner.name}
          placeholder="Workspace Owner"
        ></Input>
      </StyledSettingInputContainer>
      <StyledDeleteButtonContainer>
        {isOwner ? (
          <>
            <Button type="danger" shape="circle" onClick={handleClickDelete}>
              Delete Workspace
            </Button>
            <WorkspaceDelete
              open={showDelete}
              onClose={handleCloseDelete}
              workspaceName={workspaceName}
              workspaceId={workspace.id}
              nextWorkSpaceId={nextWorkSpaceId}
            />
          </>
        ) : (
          <>
            <Button type="danger" shape="circle" onClick={handleClickLeave}>
              Leave Workspace
            </Button>
            <WorkspaceLeave
              open={showLeave}
              onClose={handleCloseLeave}
              workspaceName={workspaceName}
              workspaceId={workspace.id}
              nextWorkSpaceId={nextWorkSpaceId}
            />
          </>
        )}
      </StyledDeleteButtonContainer>
    </div>
  ) : null;
};
