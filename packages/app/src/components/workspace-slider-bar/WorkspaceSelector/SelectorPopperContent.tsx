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

const workspaces = [
  {
    name: 'Design',
    icon: '',
  },
  {
    name: 'Operation',
    icon: '',
  },
  {
    name: 'Something is too long to show in this box',
    icon: '',
  },
];

export const SelectorPopperContent = () => {
  const { user, workspacesMeta } = useAppState();
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
      {workspacesMeta.map(workspace => {
        return (
          <WorkspaceItem
            key={workspace.id}
            id={workspace.id}
            name={`workspace-${workspace.id}`}
            icon={''}
          />
        );
      })}
      <CreateWorkspaceItem />
      <StyledDivider />
      <ListItem
        icon={<InformationIcon />}
        name="About AFFiNE"
        onClick={() => console.log('About AFFiNE')}
      />
      <ListItem
        icon={<LogOutIcon />}
        name="Sign out"
        onClick={() => console.log('Sign out')}
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
