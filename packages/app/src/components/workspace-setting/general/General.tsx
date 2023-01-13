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
// import { Upload } from '@/components/file-upload';
import { WorkspaceUnitAvatar } from '@/components/workspace-avatar';
import { WorkspaceUnit } from '@affine/datacenter';
import { useWorkspaceHelper } from '@/hooks/use-workspace-helper';
import { useTranslation } from '@affine/i18n';
export const GeneralPage = ({ workspace }: { workspace: WorkspaceUnit }) => {
  const [showDelete, setShowDelete] = useState<boolean>(false);
  const [showLeave, setShowLeave] = useState<boolean>(false);
  // const [uploading, setUploading] = useState<boolean>(false);
  const [workspaceName, setWorkspaceName] = useState<string>(workspace.name);
  const { currentWorkspace, isOwner } = useAppState();
  const { updateWorkspace } = useWorkspaceHelper();
  const { t } = useTranslation();

  const handleChangeWorkSpaceName = (newName: string) => {
    setWorkspaceName(newName);
  };
  const handleUpdateWorkspaceName = () => {
    currentWorkspace &&
      updateWorkspace({ name: workspaceName }, currentWorkspace);
  };

  // const fileChange = async (file: File) => {
  //   setUploading(true);
  //   const blob = new Blob([file], { type: file.type });
  //   currentWorkspace &&
  //     (await updateWorkspace({ avatarBlob: blob }, currentWorkspace));
  //   setUploading(false);
  // };

  return workspace ? (
    <div>
      <StyledSettingH2 marginTop={56}>{t('Workspace Icon')}</StyledSettingH2>
      <StyledSettingAvatarContent>
        <div
          style={{
            float: 'left',
            marginRight: '20px',
          }}
        >
          <WorkspaceUnitAvatar
            size={60}
            name={workspace.name}
            workspaceUnit={workspace}
          />
        </div>
        {/* TODO: Wait for image sync to complete  */}
        {/* <Upload
          accept="image/gif,image/jpeg,image/jpg,image/png,image/svg"
          fileChange={fileChange}
        >
          <Button loading={uploading}>{t('Upload')}</Button>
        </Upload> */}
        {/* TODO: add upload logic */}
      </StyledSettingAvatarContent>
      <StyledSettingH2 marginTop={20}>{t('Workspace Name')}</StyledSettingH2>
      <StyledSettingInputContainer>
        <Input
          width={327}
          value={workspaceName}
          placeholder={t('Workspace Name')}
          maxLength={14}
          minLength={1}
          disabled={!isOwner}
          onChange={handleChangeWorkSpaceName}
        ></Input>
        {isOwner ? (
          <TextButton
            onClick={() => {
              handleUpdateWorkspaceName();
            }}
            style={{ marginLeft: '0px' }}
          >
            ✔️
          </TextButton>
        ) : null}
      </StyledSettingInputContainer>
      <StyledSettingH2 marginTop={20}>{t('Workspace Type')}</StyledSettingH2>
      <StyledSettingInputContainer>
        <code>{workspace.provider} </code>
      </StyledSettingInputContainer>
      <StyledDeleteButtonContainer>
        {isOwner ? (
          <>
            <Button
              type="danger"
              shape="circle"
              onClick={() => {
                setShowDelete(true);
              }}
            >
              {t('Delete Workspace')}
            </Button>
            <WorkspaceDelete
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
              type="danger"
              shape="circle"
              onClick={() => {
                setShowLeave(true);
              }}
            >
              {t('Leave Workspace')}
            </Button>
            <WorkspaceLeave
              open={showLeave}
              onClose={() => {
                setShowLeave(false);
              }}
            />
          </>
        )}
      </StyledDeleteButtonContainer>
    </div>
  ) : null;
};
