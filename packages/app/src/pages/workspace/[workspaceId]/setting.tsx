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
import { ReactElement, useEffect, useState } from 'react';
import {
  GeneralPage,
  MembersPage,
  PublishPage,
  ExportPage,
  SyncPage,
} from '@/components/workspace-setting';
import { useAppState } from '@/providers/app-state-provider';
import WorkspaceLayout from '@/components/workspace-layout';

enum ActiveTab {
  'general' = 'general',
  'members' = 'members',
  'publish' = 'publish',
  'sync' = 'sync',
  'export' = 'export',
}

type SettingTabProps = {
  activeTab: ActiveTab;
  onTabChange?: (tab: ActiveTab) => void;
};

type WorkspaceSettingProps = {
  isShow: boolean;
  onClose?: () => void;
};

const WorkspaceSettingTab = ({ activeTab, onTabChange }: SettingTabProps) => {
  return (
    <StyledSettingTabContainer>
      <WorkspaceSettingTagItem
        isActive={activeTab === ActiveTab.general}
        onClick={() => {
          onTabChange && onTabChange(ActiveTab.general);
        }}
      >
        <StyledSettingTagIconContainer>
          <EditIcon />
        </StyledSettingTagIconContainer>
        General
      </WorkspaceSettingTagItem>

      <WorkspaceSettingTagItem
        isActive={activeTab === ActiveTab.sync}
        onClick={() => {
          onTabChange && onTabChange(ActiveTab.sync);
        }}
      >
        <StyledSettingTagIconContainer>
          <CloudInsyncIcon />
        </StyledSettingTagIconContainer>
        Sync
      </WorkspaceSettingTagItem>

      <WorkspaceSettingTagItem
        isActive={activeTab === ActiveTab.members}
        onClick={() => {
          onTabChange && onTabChange(ActiveTab.members);
        }}
      >
        <StyledSettingTagIconContainer>
          <UsersIcon />
        </StyledSettingTagIconContainer>
        Collaboration
      </WorkspaceSettingTagItem>
      <WorkspaceSettingTagItem
        isActive={activeTab === ActiveTab.publish}
        onClick={() => {
          onTabChange && onTabChange(ActiveTab.publish);
        }}
      >
        <StyledSettingTagIconContainer>
          <PublishIcon />
        </StyledSettingTagIconContainer>
        Publish
      </WorkspaceSettingTagItem>

      <WorkspaceSettingTagItem
        isActive={activeTab === ActiveTab.export}
        onClick={() => {
          onTabChange && onTabChange(ActiveTab.export);
        }}
      >
        <StyledSettingTagIconContainer>
          <PublishIcon />
        </StyledSettingTagIconContainer>
        Export
      </WorkspaceSettingTagItem>
    </StyledSettingTabContainer>
  );
};

const WorkspaceSetting = ({ isShow, onClose }: WorkspaceSettingProps) => {
  // const { workspaces } = useAppState();
  const [activeTab, setActiveTab] = useState<ActiveTab>(ActiveTab.general);
  const handleTabChange = (tab: ActiveTab) => {
    setActiveTab(tab);
  };

  const { currentMetaWorkSpace } = useAppState();
  useEffect(() => {
    // reset tab when modal is closed
    if (!isShow) {
      setActiveTab(ActiveTab.general);
    }
  }, [isShow]);
  return (
    <StyledSettingContainer>
      <StyledSettingSidebar>
        <StyledSettingSidebarHeader>
          Workspace Settings
        </StyledSettingSidebarHeader>
        <WorkspaceSettingTab
          activeTab={activeTab}
          onTabChange={handleTabChange}
        />
      </StyledSettingSidebar>

      <StyledSettingContent>
        {activeTab === ActiveTab.general && currentMetaWorkSpace && (
          <GeneralPage workspace={currentMetaWorkSpace} />
        )}
        {activeTab === ActiveTab.sync && currentMetaWorkSpace && (
          <SyncPage workspace={currentMetaWorkSpace} />
        )}
        {activeTab === ActiveTab.members && currentMetaWorkSpace && (
          <MembersPage workspace={currentMetaWorkSpace} />
        )}
        {activeTab === ActiveTab.publish && currentMetaWorkSpace && (
          <PublishPage workspace={currentMetaWorkSpace} />
        )}
        {activeTab === ActiveTab.export && currentMetaWorkSpace && (
          <ExportPage workspace={currentMetaWorkSpace} />
        )}
      </StyledSettingContent>
    </StyledSettingContainer>
  );
};
WorkspaceSetting.getLayout = function getLayout(page: ReactElement) {
  return <WorkspaceLayout>{page}</WorkspaceLayout>;
};

export default WorkspaceSetting;
