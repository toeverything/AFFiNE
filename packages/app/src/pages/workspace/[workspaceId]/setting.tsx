import {
  StyledSettingContainer,
  StyledSettingContent,
  StyledSettingSidebar,
  StyledSettingSidebarHeader,
  StyledSettingTabContainer,
  StyledSettingTagIconContainer,
  WorkspaceSettingTagItem,
} from '@/components/workspace-setting/style';
import {
  EditIcon,
  UsersIcon,
  PublishIcon,
  CloudInsyncIcon,
} from '@blocksuite/icons';
import { ReactElement, ReactNode, useState } from 'react';
import {
  GeneralPage,
  MembersPage,
  PublishPage,
  ExportPage,
  SyncPage,
} from '@/components/workspace-setting';
import { useAppState } from '@/providers/app-state-provider';
import WorkspaceLayout from '@/components/workspace-layout';
import { WorkspaceUnit } from '@affine/datacenter';

type TabNames = 'general' | 'members' | 'publish' | 'sync' | 'export';

const tabMap: {
  name: TabNames;
  icon: ReactNode;
  panelRender: (workspace: WorkspaceUnit) => ReactNode;
}[] = [
  {
    name: 'general',
    icon: <EditIcon />,
    panelRender: workspace => <GeneralPage workspace={workspace} />,
  },
  {
    name: 'members',
    icon: <CloudInsyncIcon />,
    panelRender: workspace => <MembersPage workspace={workspace} />,
  },
  {
    name: 'publish',
    icon: <UsersIcon />,
    panelRender: workspace => <PublishPage workspace={workspace} />,
  },
  {
    name: 'sync',
    icon: <PublishIcon />,
    panelRender: workspace => <SyncPage workspace={workspace} />,
  },
  {
    name: 'export',
    icon: <PublishIcon />,
    panelRender: workspace => <ExportPage workspace={workspace} />,
  },
];

const WorkspaceSetting = () => {
  const { currentWorkspace } = useAppState();

  const [activeTab, setActiveTab] = useState<TabNames>(tabMap[0].name);
  const handleTabChange = (tab: TabNames) => {
    setActiveTab(tab);
  };

  const activeTabPanelRender = tabMap.find(
    tab => tab.name === activeTab
  )?.panelRender;

  return (
    <StyledSettingContainer>
      <StyledSettingSidebar>
        <StyledSettingSidebarHeader>
          Workspace Settings
        </StyledSettingSidebarHeader>
        <StyledSettingTabContainer>
          {tabMap.map(({ icon, name }) => {
            return (
              <WorkspaceSettingTagItem
                key={name}
                isActive={activeTab === name}
                onClick={() => {
                  handleTabChange(name);
                }}
              >
                <StyledSettingTagIconContainer>
                  {icon}
                </StyledSettingTagIconContainer>
                {name}
              </WorkspaceSettingTagItem>
            );
          })}
        </StyledSettingTabContainer>
      </StyledSettingSidebar>

      <StyledSettingContent>
        {currentWorkspace && activeTabPanelRender?.(currentWorkspace)}
      </StyledSettingContent>
    </StyledSettingContainer>
  );
};
WorkspaceSetting.getLayout = function getLayout(page: ReactElement) {
  return <WorkspaceLayout>{page}</WorkspaceLayout>;
};

export default WorkspaceSetting;
