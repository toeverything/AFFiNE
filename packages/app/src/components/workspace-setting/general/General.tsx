import {
  StyledDeleteButtonContainer,
  // StyledSettingAvatar,
  StyledSettingAvatarContent,
  StyledSettingInputContainer,
} from './style';
import { StyledSettingH2 } from '../style';

import { useState } from 'react';
import { Button, TextButton } from '@/ui/button';
import Input from '@/ui/input';
import { useAppState } from '@/providers/app-state-provider';
import { WorkspaceDelete } from './delete';
import { WorkspaceLeave } from './leave';
import { Upload } from '@/components/file-upload';
import { WorkspaceAvatar } from '@/components/workspace-avatar';
import { WorkspaceInfo } from '@affine/datacenter';
export const GeneralPage = ({ workspace }: { workspace: WorkspaceInfo }) => {
  const [showDelete, setShowDelete] = useState<boolean>(false);
  const [showLeave, setShowLeave] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);
  const [workspaceName, setWorkspaceName] = useState<string>(workspace.name);
  const isOwner = true;
  const handleChangeWorkSpaceName = (newName: string) => {
    setWorkspaceName(newName);
  };
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
  const handleUpdateWorkspaceName = () => {
    // workspace && currentWorkspace(workspace.id, { name: workspaceName });
  };

  const fileChange = async (file: File) => {
    console.log('file: ', file);
    setUploading(true);
    // const blob = new Blob([file], { type: file.type });
    // const blobId = await getDataCenter()
    //   .then(dc => dc.apis.uploadBlob({ blob }))
    //   .finally(() => {
    //     setUploading(false);
    //   });
    // if (blobId) {
    //   currentWorkspace?.meta.setAvatar(blobId);
    //   // workspaces[workspace.id]?.meta.setAvatar(blobId);
    //   setUploading(false);
    //   debouncedRefreshWorkspacesMeta();
    // }
  };

  return workspace ? (
    <div>
      <StyledSettingH2 marginTop={56}>Workspace Icon</StyledSettingH2>
      <StyledSettingAvatarContent>
        <div
          style={{
            float: 'left',
            marginRight: '20px',
          }}
        >
          <WorkspaceAvatar size={60} name={workspace.name} />
        </div>
        <Upload
          accept="image/gif,image/jpeg,image/jpg,image/png,image/svg"
          fileChange={fileChange}
        >
          <Button loading={uploading}>Upload</Button>
        </Upload>
        {/* TODO: add upload logic */}
      </StyledSettingAvatarContent>
      <StyledSettingH2 marginTop={20}>Workspace Name</StyledSettingH2>
      <StyledSettingInputContainer>
        <Input
          width={327}
          value={workspaceName}
          placeholder="Workspace Name"
          maxLength={14}
          minLength={1}
          onChange={handleChangeWorkSpaceName}
        ></Input>
        <TextButton
          onClick={() => {
            handleUpdateWorkspaceName();
          }}
          style={{ marginLeft: '0px' }}
        >
          ✔️
        </TextButton>
      </StyledSettingInputContainer>
      {/* {userInfo ? (
        <div>
          <StyledSettingH2 marginTop={20}>Workspace Owner</StyledSettingH2>
          <StyledSettingInputContainer>
            <Input
              width={327}
              disabled
              value={userInfo?.name}
              placeholder="Workspace Owner"
            ></Input>
          </StyledSettingInputContainer>
        </div>
      ) : (
        ''
      )} */}

      <StyledSettingH2 marginTop={20}>Workspace Type</StyledSettingH2>
      <StyledSettingInputContainer>
        <code>{workspace.provider} </code>
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
              workspace={workspace}
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
            />
          </>
        )}
      </StyledDeleteButtonContainer>
    </div>
  ) : null;
};
