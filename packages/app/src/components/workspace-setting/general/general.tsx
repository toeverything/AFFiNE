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
import { Workspace, WorkspaceType } from '@pathfinder/data-services';
import { useAppState } from '@/providers/app-state-provider';
import { WorkspaceDetails } from '@/components/workspace-slider-bar/WorkspaceSelector/SelectorPopperContent';
import { WorkspaceDelete } from './delete';
import { Workspace as StoreWorkspaces } from '@blocksuite/store';

export const GeneralPage = ({
  workspace,
  owner,
  workspaces,
}: {
  workspace: Workspace;
  owner: WorkspaceDetails[string]['owner'];
  workspaces: Record<string, StoreWorkspaces | null>;
}) => {
  const { user, currentWorkspace, workspacesMeta } = useAppState();
  const [showDelete, setShowDelete] = useState<boolean>(false);
  const [workspaceName, setWorkspaceName] = useState<string>(
    workspaces[workspace.id]?.meta.name ||
      (workspace.type === WorkspaceType.Private && user
        ? user.name
        : `workspace-${workspace?.id}`)
  );
  const isOwner = user && owner.id === user.id;
  const handleChangeWorkSpaceName = (newName: string) => {
    setWorkspaceName(newName);
    currentWorkspace?.meta.setName(newName);
    workspaces[workspace.id]?.meta.setName(newName);
  };
  const currentWorkspaceIndex = workspacesMeta.findIndex(
    meta => meta.id === workspace.id
  );
  const nextWorkSpaceId =
    currentWorkspaceIndex > workspacesMeta.length - 1
      ? workspacesMeta[currentWorkspaceIndex - 1]?.id
      : workspacesMeta[currentWorkspaceIndex + 1]?.id;
  const handleCloseDelete = () => {
    setShowDelete(false);
  };
  const handleClickDelete = () => {
    setShowDelete(true);
  };
  return workspace ? (
    <div>
      <WorkspaceDelete
        open={showDelete}
        onClose={handleCloseDelete}
        workspaceName={workspaceName}
        workspaceId={workspace.id}
        nextWorkSpaceId={nextWorkSpaceId}
      ></WorkspaceDelete>
      <StyledSettingH2 marginTop={56}>Workspace Avatar</StyledSettingH2>
      <StyledSettingAvatarContent>
        <StyledSettingAvatar
          alt="workspace avatar"
          src={workspaces[workspace.id]?.meta.avatar || ''}
        >
          W
        </StyledSettingAvatar>
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
        <Button type="danger" shape="circle" onClick={handleClickDelete}>
          Delete Workspace
        </Button>
      </StyledDeleteButtonContainer>
    </div>
  ) : null;
};
