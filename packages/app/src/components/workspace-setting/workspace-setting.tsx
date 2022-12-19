import Modal from '@/ui/modal';
import {
  StyledSettingContent,
  StyledSettingH2,
  StyledSettingSidebar,
  StyledSettingSidebarHeader,
  StyledSettingTabContainer,
  StyledSettingTagIconContainer,
  WorkspaceSettingTagItem,
} from './style';
import { EditIcon, UsersIcon, PublishIcon } from '@blocksuite/icons';
import { useState } from 'react';

enum ActiveTab {
  'general' = 'general',
  'members' = 'members',
  'publish' = 'publish',
}

type SettingTabProps = {
  activeTab: ActiveTab;
  onTabChange?: (tab: ActiveTab) => void;
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
        isActive={activeTab === ActiveTab.members}
        onClick={() => {
          onTabChange && onTabChange(ActiveTab.members);
        }}
      >
        <StyledSettingTagIconContainer>
          <UsersIcon />
        </StyledSettingTagIconContainer>
        Members
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
    </StyledSettingTabContainer>
  );
};

export const WorkspaceSetting = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>(ActiveTab.general);
  const handleTabChange = (tab: ActiveTab) => {
    setActiveTab(tab);
  };
  return (
    <Modal open={true}>
      <StyledSettingContent>
        <StyledSettingSidebar>
          <StyledSettingSidebarHeader>
            Workspace Settings
          </StyledSettingSidebarHeader>
          <WorkspaceSettingTab
            activeTab={activeTab}
            onTabChange={handleTabChange}
          />
        </StyledSettingSidebar>
        {activeTab === ActiveTab.general && <GeneralPage />}
      </StyledSettingContent>
    </Modal>
  );
};

const GeneralPage = () => {
  return (
    <div>
      <StyledSettingH2>Workspace Avatar</StyledSettingH2>
    </div>
  );
};
