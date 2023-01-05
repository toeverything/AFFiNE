import {
  StyledDeleteButtonContainer,
  // StyledSettingAvatar,
  StyledSettingAvatarContent,
  StyledSettingInputContainer,
} from './style';
import { StyledSettingH2 } from '../style';

import { useEffect, useState } from 'react';
import { Button, TextButton } from '@/ui/button';
import Input from '@/ui/input';
import { getDataCenter } from '@affine/datacenter';
import { useAppState } from '@/providers/app-state-provider';
import { WorkspaceDelete } from './delete';
import { debounce } from '@/utils';
import { WorkspaceLeave } from './leave';
import { Upload } from '@/components/file-upload';
import {
  getUserInfo,
  updateWorkspaceMeta,
  User,
  Workspace,
} from '@/hooks/mock-data/mock';
import { stringToColour } from '@/utils';
export const GeneralPage = ({ workspace }: { workspace: Workspace }) => {
  const { currentWorkspace, refreshWorkspacesMeta } = useAppState();
  useEffect(() => {
    setWorkspaceName(workspace.name);
    const user = getUserInfo();
    setUserInfo(user);
  }, []);
  const [showDelete, setShowDelete] = useState<boolean>(false);
  const [userInfo, setUserInfo] = useState<User>();
  const [showLeave, setShowLeave] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);
  const [workspaceName, setWorkspaceName] = useState<string>('');
  const debouncedRefreshWorkspacesMeta = debounce(() => {
    refreshWorkspacesMeta();
  }, 100);
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
    updateWorkspaceMeta(workspace.id, { name: workspaceName });
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
      // workspaces[workspace.id]?.meta.setAvatar(blobId);
      setUploading(false);
      debouncedRefreshWorkspacesMeta();
    }
  };

  return workspace ? (
    <div>
      <StyledSettingH2 marginTop={56}>Workspace Avatar</StyledSettingH2>
      <StyledSettingAvatarContent>
        {/* <StyledSettingAvatar alt="workspace avatar" src={''}>
          AFFiNE
        </StyledSettingAvatar> */}
        <div
          style={{
            float: 'left',
            width: '60px',
            height: '60px',
            border: '1px solid #fff',
            color: '#fff',
            fontSize: '26px',
            background: stringToColour(workspace?.name ?? 'AFFiNE'),
            borderRadius: '50%',
            textAlign: 'center',
            lineHeight: '60px',
            marginRight: '5px',
          }}
        >
          {(workspace?.name ?? 'AFFiNE').substring(0, 1)}
        </div>
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
          style={{ marginLeft: '10px' }}
        >
          ✔️
        </TextButton>
      </StyledSettingInputContainer>
      {userInfo ? (
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
      )}

      <StyledSettingH2 marginTop={20}>Workspace Type</StyledSettingH2>
      <StyledSettingInputContainer>
        {workspace.type}
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
