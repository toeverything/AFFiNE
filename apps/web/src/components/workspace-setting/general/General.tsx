import {
  StyledInput,
  StyledWorkspaceInfo,
  StyledAvatar,
  StyledEditButton,
} from './style';
import { StyledSettingKey, StyledRow } from '../style';
import { FlexWrapper } from '@affine/component';

import { useState } from 'react';
import { Button } from '@affine/component';
import { useAppState } from '@/providers/app-state-provider';
import { WorkspaceDelete } from './delete';
import { WorkspaceLeave } from './leave';
import {
  JoinedWorkspaceIcon,
  CloudWorkspaceIcon,
  LocalWorkspaceIcon,
} from '@/components/icons';
import { WorkspaceUnitAvatar } from '@/components/workspace-avatar';
import { WorkspaceUnit } from '@affine/datacenter';
import { useWorkspaceHelper } from '@/hooks/use-workspace-helper';
import { useTranslation } from '@affine/i18n';
import { CameraIcon } from './icons';
import { Upload } from '@/components/file-upload';
import { MuiFade } from '@affine/component';
import { useGlobalState } from '@/store/app';
export const GeneralPage = ({ workspace }: { workspace: WorkspaceUnit }) => {
  const [showDelete, setShowDelete] = useState<boolean>(false);
  const [showLeave, setShowLeave] = useState<boolean>(false);
  const [workspaceName, setWorkspaceName] = useState<string>(workspace?.name);
  const [showEditInput, setShowEditInput] = useState(false);
  const isOwner = useGlobalState(store => store.isOwner);
  const { currentWorkspace } = useAppState();
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

        <div style={{ position: 'relative' }}>
          <MuiFade in={!showEditInput}>
            <FlexWrapper>
              {workspace.name}
              {isOwner && (
                <StyledEditButton
                  onClick={() => {
                    setShowEditInput(true);
                  }}
                >
                  {t('Edit')}
                </StyledEditButton>
              )}
            </FlexWrapper>
          </MuiFade>

          {isOwner && (
            <MuiFade in={showEditInput}>
              <FlexWrapper style={{ position: 'absolute', top: 0, left: 0 }}>
                <StyledInput
                  width={284}
                  height={38}
                  value={workspaceName}
                  placeholder={t('Workspace Name')}
                  maxLength={15}
                  minLength={0}
                  onChange={newName => {
                    setWorkspaceName(newName);
                  }}
                ></StyledInput>
                <Button
                  type="light"
                  shape="circle"
                  style={{ marginLeft: '24px' }}
                  disabled={workspaceName === workspace.name}
                  onClick={() => {
                    handleUpdateWorkspaceName();
                    setShowEditInput(false);
                  }}
                >
                  {t('Confirm')}
                </Button>
                <Button
                  type="default"
                  shape="circle"
                  style={{ marginLeft: '24px' }}
                  onClick={() => {
                    setWorkspaceName(workspace.name);
                    setShowEditInput(false);
                  }}
                >
                  {t('Cancel')}
                </Button>
              </FlexWrapper>
            </MuiFade>
          )}
        </div>
      </StyledRow>

      <StyledRow>
        <StyledSettingKey>{t('Workspace Type')}</StyledSettingKey>
        {isOwner ? (
          currentWorkspace?.provider === 'local' ? (
            <StyledWorkspaceInfo>
              <LocalWorkspaceIcon />
              <span>{t('Local Workspace')}</span>
            </StyledWorkspaceInfo>
          ) : (
            <StyledWorkspaceInfo>
              <CloudWorkspaceIcon />
              <span>{t('Available Offline')}</span>
            </StyledWorkspaceInfo>
          )
        ) : (
          <StyledWorkspaceInfo>
            <JoinedWorkspaceIcon />
            <span>{t('Joined Workspace')}</span>
          </StyledWorkspaceInfo>
        )}
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
