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
import { useCallback, useEffect, useState } from 'react';
import { getDataCenter, WorkspaceType } from '@affine/datacenter';
import { useModal } from '@/providers/GlobalModalProvider';

export type WorkspaceDetails = Record<
  string,
  { memberCount: number; owner: { id: string; name: string } }
>;

type SelectorPopperContentProps = {
  isShow: boolean;
};

export const SelectorPopperContent = ({
  isShow,
}: SelectorPopperContentProps) => {
  const { user, workspacesMeta, refreshWorkspacesMeta } = useAppState();
  const [settingWorkspaceId, setSettingWorkspaceId] = useState<string | null>(
    null
  );
  const [workSpaceDetails, setWorkSpaceDetails] = useState<WorkspaceDetails>(
    {}
  );
  const { triggerContactModal } = useModal();

  const handleClickSettingWorkspace = (workspaceId: string) => {
    setSettingWorkspaceId(workspaceId);
  };
  const handleCloseWorkSpace = () => {
    setSettingWorkspaceId(null);
  };
  const settingWorkspace = settingWorkspaceId
    ? workspacesMeta.find(workspace => workspace.id === settingWorkspaceId)
    : undefined;

  const refreshDetails = useCallback(async () => {
    const workspaceDetailList = await Promise.all(
      workspacesMeta.map(async ({ id, type }) => {
        if (user) {
          if (type === WorkspaceType.Private) {
            return { id, member_count: 1, owner: user };
          } else {
            // const dc = await getDataCenter();
            // const data = await dc.apis.getWorkspaceDetail({ id });
            // return { id, ...data } || { id, member_count: 0, owner: user };
          }
        }
      })
    );
    const workSpaceDetails: WorkspaceDetails = {};
    workspaceDetailList.forEach(details => {
      if (details) {
        const { id, member_count, owner } = details;
        if (!owner) return;
        workSpaceDetails[id] = {
          memberCount: member_count || 1,
          owner: {
            id: owner.id,
            name: owner.name,
          },
        };
      }
    });
    setWorkSpaceDetails(workSpaceDetails);
  }, [user, workspacesMeta]);

  useEffect(() => {
    if (isShow) {
      setSettingWorkspaceId(null);
      refreshWorkspacesMeta();
      refreshDetails();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isShow]);

  return !user ? (
    <SelectorPopperContainer placement="bottom-start">
      <LoginItem />
      <StyledDivider />
      <ListItem
        icon={<InformationIcon />}
        name="About AFFiNE"
        onClick={() => triggerContactModal()}
      />
    </SelectorPopperContainer>
  ) : (
    <SelectorPopperContainer placement="bottom-start">
      <PrivateWorkspaceItem
        privateWorkspaceId={
          workspacesMeta.find(
            workspace => workspace.type === WorkspaceType.Private
          )?.id
        }
      />
      <StyledDivider />
      <WorkspaceGroupTitle>Workspace</WorkspaceGroupTitle>
      <WorkspaceWrapper>
        {workspacesMeta.map(workspace => {
          return workspace.type !== WorkspaceType.Private ? (
            <WorkspaceItem
              type={workspace.type}
              key={workspace.id}
              id={workspace.id}
              icon={`loading...`}
              onClickSetting={handleClickSettingWorkspace}
              name={`loading...`}
              memberCount={workSpaceDetails[workspace.id]?.memberCount || 1}
            />
          ) : null;
        })}
      </WorkspaceWrapper>
      <CreateWorkspaceItem />
      {settingWorkspace ? (
        <WorkspaceSetting
          isShow={false}
          onClose={handleCloseWorkSpace}
          // workspace={settingWorkspace}
          // owner={
          //   (settingWorkspaceId &&
          //     workSpaceDetails[settingWorkspaceId]?.owner) || {
          //     id: user.id,
          //     name: user.name,
          //   }
          // }
        />
      ) : null}
      <StyledDivider />
      <ListItem
        icon={<InformationIcon />}
        name="About AFFiNE"
        onClick={() => triggerContactModal()}
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

const WorkspaceWrapper = styled('div')(() => {
  return {
    maxHeight: '200px',
    overflow: 'auto',
  };
});
