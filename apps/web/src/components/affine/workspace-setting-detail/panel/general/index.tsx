import { Button, FlexWrapper, MuiFade } from '@affine/component';
import { WorkspaceAvatar } from '@affine/component/workspace-avatar';
import { useTranslation } from '@affine/i18n';
import { WorkspaceFlavour } from '@affine/workspace/type';
import { useBlockSuiteWorkspaceAvatarUrl } from '@toeverything/hooks/use-block-suite-workspace-avatar-url';
import { useBlockSuiteWorkspaceName } from '@toeverything/hooks/use-block-suite-workspace-name';
import type React from 'react';
import { useState } from 'react';

import { useIsWorkspaceOwner } from '../../../../../hooks/affine/use-is-workspace-owner';
import { Upload } from '../../../../pure/file-upload';
import {
  CloudWorkspaceIcon,
  JoinedWorkspaceIcon,
  LocalWorkspaceIcon,
} from '../../../../pure/icons';
import type { PanelProps } from '../../index';
import { StyledRow, StyledSettingKey } from '../../style';
import { WorkspaceDeleteModal } from './delete';
import { CameraIcon } from './icons';
import { WorkspaceLeave } from './leave';
import {
  StyledAvatar,
  StyledEditButton,
  StyledInput,
  StyledWorkspaceInfo,
} from './style';

export const GeneralPanel: React.FC<PanelProps> = ({
  workspace,
  onDeleteWorkspace,
}) => {
  const [showDelete, setShowDelete] = useState<boolean>(false);
  const [showLeave, setShowLeave] = useState<boolean>(false);
  const [name, setName] = useBlockSuiteWorkspaceName(
    workspace.blockSuiteWorkspace
  );
  const [input, setInput] = useState<string>(name);
  const isOwner = useIsWorkspaceOwner(workspace);
  const [showEditInput, setShowEditInput] = useState(false);
  const { t } = useTranslation();

  const handleUpdateWorkspaceName = (name: string) => {
    setName(name);
  };

  const [, update] = useBlockSuiteWorkspaceAvatarUrl(
    workspace.blockSuiteWorkspace
  );
  return (
    <>
      <StyledRow>
        <StyledSettingKey>{t('Workspace Avatar')}</StyledSettingKey>
        <StyledAvatar disabled={!isOwner}>
          {isOwner ? (
            <Upload
              accept="image/gif,image/jpeg,image/jpg,image/png,image/svg"
              fileChange={update}
              data-testid="upload-avatar"
            >
              <>
                <div className="camera-icon">
                  <CameraIcon></CameraIcon>
                </div>
                <WorkspaceAvatar size={72} workspace={workspace} />
              </>
            </Upload>
          ) : (
            <WorkspaceAvatar size={72} workspace={workspace} />
          )}
        </StyledAvatar>
      </StyledRow>

      <StyledRow>
        <StyledSettingKey>{t('Workspace Name')}</StyledSettingKey>

        <div style={{ position: 'relative' }}>
          <MuiFade in={!showEditInput}>
            <FlexWrapper>
              {name}
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
                  value={input}
                  placeholder={t('Workspace Name')}
                  maxLength={50}
                  minLength={0}
                  onChange={newName => {
                    setInput(newName);
                  }}
                ></StyledInput>
                <Button
                  type="light"
                  shape="circle"
                  style={{ marginLeft: '24px' }}
                  disabled={input === workspace.blockSuiteWorkspace.meta.name}
                  onClick={() => {
                    handleUpdateWorkspaceName(input);
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
                    setInput(workspace.blockSuiteWorkspace.meta.name ?? '');
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

      {/* fixme(himself65): how to know a workspace owner by api? */}
      {/*{!isOwner && (*/}
      {/*  <StyledRow>*/}
      {/*    <StyledSettingKey>{t('Workspace Owner')}</StyledSettingKey>*/}
      {/*    <FlexWrapper alignItems="center">*/}
      {/*      <MuiAvatar*/}
      {/*        sx={{ width: 72, height: 72, marginRight: '12px' }}*/}
      {/*        alt="owner avatar"*/}
      {/*        // src={currentWorkspace?.owner?.avatar}*/}
      {/*      >*/}
      {/*        <EmailIcon />*/}
      {/*      </MuiAvatar>*/}
      {/*      /!*<span>{currentWorkspace?.owner?.name}</span>*!/*/}
      {/*    </FlexWrapper>*/}
      {/*  </StyledRow>*/}
      {/*)}*/}
      {/*{!isOwner && (*/}
      {/*  <StyledRow>*/}
      {/*    <StyledSettingKey>{t('Members')}</StyledSettingKey>*/}
      {/*    <FlexWrapper alignItems="center">*/}
      {/*      /!*<span>{currentWorkspace?.memberCount}</span>*!/*/}
      {/*    </FlexWrapper>*/}
      {/*  </StyledRow>*/}
      {/*)}*/}

      <StyledRow
        onClick={() => {
          if (environment.isDesktop) {
            window.apis.openDBFolder();
          }
        }}
      >
        <StyledSettingKey>{t('Workspace Type')}</StyledSettingKey>
        {isOwner ? (
          workspace.flavour === WorkspaceFlavour.LOCAL ? (
            <StyledWorkspaceInfo>
              <LocalWorkspaceIcon />
              <span>{t('Local Workspace')}</span>
            </StyledWorkspaceInfo>
          ) : (
            <StyledWorkspaceInfo>
              <CloudWorkspaceIcon />
              <span>{t('Cloud Workspace')}</span>
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
              type="warning"
              shape="circle"
              style={{ borderRadius: '40px' }}
              data-testid="delete-workspace-button"
              onClick={() => {
                setShowDelete(true);
              }}
            >
              {t('Delete Workspace')}
            </Button>
            <WorkspaceDeleteModal
              onDeleteWorkspace={onDeleteWorkspace}
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
              type="warning"
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
