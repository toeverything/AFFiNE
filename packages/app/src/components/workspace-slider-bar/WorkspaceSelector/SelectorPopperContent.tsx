import { InformationIcon, LogOutIcon } from '@blocksuite/icons';
import { styled } from '@/styles';
import { Divider } from '@/ui/divider';
import { useAppState } from '@/providers/app-state-provider/context';
import { SelectorPopperContainer } from './styles';
import {
  PrivateWorkspaceItem,
  WorkspaceItem,
  CreateWorkspaceItem,
  ListItem,
  LoginItem,
} from './WorkspaceItem';
import { WorkspaceSetting } from '@/components/workspace-setting';
import { useState } from 'react';
import { WorkspaceType } from '@pathfinder/data-services';

export const SelectorPopperContent = () => {
  const { user, workspacesMeta } = useAppState();
  const [settingWorkspaceId, setSettingWorkspaceId] = useState<string | null>(
    null
  );
  const handleClickSettingWorkspace = (workspaceId: string) => {
    setSettingWorkspaceId(workspaceId);
  };
  const handleCloseWorkSpace = () => {
    setSettingWorkspaceId(null);
  };
  return !user ? (
    <SelectorPopperContainer placement="bottom-start">
      <LoginItem />
      <StyledDivider />
      <ListItem
        icon={<InformationIcon />}
        name="About AFFiNE"
        onClick={() => console.log('About AFFiNE')}
      />
    </SelectorPopperContainer>
  ) : (
    <SelectorPopperContainer placement="bottom-start">
      <PrivateWorkspaceItem />
      <StyledDivider />
      <WorkspaceGroupTitle>Workspace</WorkspaceGroupTitle>
      <WorkspaceWrapper>
        {workspacesMeta.map(workspace => {
          return (
            <WorkspaceItem
              type={workspace.type}
              key={workspace.id}
              id={workspace.id}
              name={`workspace-${workspace.id}`}
              icon={''}
              onClick={handleClickSettingWorkspace}
            />
          );
        })}
      </WorkspaceWrapper>
      <CreateWorkspaceItem />
      <WorkspaceSetting
        isShow={Boolean(settingWorkspaceId)}
        onClose={handleCloseWorkSpace}
        workspace={
          settingWorkspaceId
            ? workspacesMeta.find(
                workspace => workspace.id === settingWorkspaceId
              )
            : undefined
        }
      />
      <StyledDivider />
      <ListItem
        icon={<InformationIcon />}
        name="About AFFiNE"
        onClick={() => console.log('About AFFiNE')}
      />
      <ListItem
        icon={<LogOutIcon />}
        name="Sign out"
        onClick={() => {
          console.log('Sign out');
          // FIXME: remove token from local storage and reload the page
          localStorage.removeItem('affine_token');
          window.location.reload();
        }}
      />
    </SelectorPopperContainer>
  );
};

const StyledDivider = styled(Divider)({
  margin: '8px 12px',
  width: 'calc(100% - 24px)',
});

const WorkspaceGroupTitle = styled('div')(({ theme }) => {
  return {
    color: theme.colors.iconColor,
    fontSize: theme.font.sm,
    lineHeight: '30px',
    height: '30px',
    padding: '0 12px',
  };
});

const WorkspaceWrapper = styled('div')(({ theme }) => {
  return {
    maxHeight: '200px',
    overflow: 'auto',
  };
});
