import { StyledInput, StyledProviderInfo, StyledAvatar } from './style';
import { StyledSettingKey, StyledRow } from '../style';
import { FlexWrapper, Content } from '@/ui/layout';

import { useState } from 'react';
import { Button } from '@/ui/button';
import { useAppState } from '@/providers/app-state-provider';
import { WorkspaceDelete } from './delete';
import { WorkspaceLeave } from './leave';
import { UsersIcon } from '@blocksuite/icons';
import { WorkspaceUnitAvatar } from '@/components/workspace-avatar';
import { WorkspaceUnit } from '@affine/datacenter';
import { useWorkspaceHelper } from '@/hooks/use-workspace-helper';
import { useTranslation } from '@affine/i18n';
import { CloudIcon, LocalIcon } from '@/components/workspace-modal/icons';
import { CameraIcon } from './icons';
import { Upload } from '@/components/file-upload';
export const GeneralPage = ({ workspace }: { workspace: WorkspaceUnit }) => {
  const [showDelete, setShowDelete] = useState<boolean>(false);
  const [showLeave, setShowLeave] = useState<boolean>(false);
  const [workspaceName, setWorkspaceName] = useState<string>(workspace.name);
  const { currentWorkspace, isOwner } = useAppState();
  const { updateWorkspace } = useWorkspaceHelper();
  const { t } = useTranslation();

  const handleUpdateWorkspaceName = () => {
    currentWorkspace &&
      updateWorkspace({ name: workspaceName }, currentWorkspace);
  };

  const fileChange = async (file: File) => {
    const blob = new Blob([file], { type: file.type });
    currentWorkspace &&
      (await updateWorkspace({ avatarBlob: blob }, currentWorkspace));
  };
  if (!workspace) {
    return null;
  }

  return (
    <>
      <StyledRow>
        <StyledSettingKey>{t('Workspace Avatar')}</StyledSettingKey>
        <StyledAvatar disabled={!isOwner}>
         {isOwner ? (
              <Upload
                accept="image/gif,image/jpeg,image/jpg,image/png,image/svg"
                fileChange={fileChange}
              >
                <>
                  <div className="camera-icon">
                    <CameraIcon></CameraIcon>
                  </div>
                  <WorkspaceUnitAvatar
                    size={72}
                    name={workspace.name}
                    workspaceUnit={workspace}
                  />
                </>
              </Upload>
            ) : (
              <WorkspaceUnitAvatar
                size={72}
                name={workspace.name}
                workspaceUnit={workspace}
              />
            )}
        </StyledAvatar>
      </StyledRow>

      <StyledRow>
        <StyledSettingKey>{t('Workspace Name')}</StyledSettingKey>
        <FlexWrapper>
          <StyledInput
            width={284}
            height={38}
            value={workspaceName}
            placeholder={t('Workspace Name')}
            maxLength={15}
            minLength={0}
            disabled={!isOwner}
            onChange={newName => {
              setWorkspaceName(newName);
            }}
          ></StyledInput>
          {isOwner && (
            <>
              <Button
                type="default"
                shape="circle"
                style={{ marginLeft: '24px' }}
                onClick={() => {
                  setWorkspaceName(workspace.name);
                }}
              >
                {t('Cancel')}
              </Button>
              <Button
                type="light"
                shape="circle"
                style={{ marginLeft: '24px' }}
                onClick={() => {
                  handleUpdateWorkspaceName();
                }}
              >
                {t('Confirm')}
              </Button>
            </>
          )}
        </FlexWrapper>
      </StyledRow>

      <StyledRow>
        <StyledSettingKey>{t('Workspace Type')}</StyledSettingKey>
        <FlexWrapper>
          {isOwner ? (
            currentWorkspace?.provider === 'local' ? (
              <FlexWrapper alignItems="center">
                <LocalIcon />
                <Content style={{ marginLeft: '15px' }}>
                  {t('Local Workspace')}
                </Content>
              </FlexWrapper>
            ) : (
              <FlexWrapper alignItems="center">
                <CloudIcon />
                <Content style={{ marginLeft: '15px' }}>
                  {t('Available Offline')}
                </Content>
              </FlexWrapper>
            )
          ) : (
            <StyledProviderInfo>
              <UsersIcon fontSize={20} color={'#FF646B'} />
              {t('Joined Workspace')}
            </StyledProviderInfo>
          )}
        </FlexWrapper>
      </StyledRow>

      <StyledRow>
        <StyledSettingKey> {t('Delete Workspace')}</StyledSettingKey>
        {isOwner ? (
          <>
            <Button
              type="danger"
              shape="circle"
              style={{ borderRadius: '40px' }}
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
      </StyledRow>
    </>
  );
};
