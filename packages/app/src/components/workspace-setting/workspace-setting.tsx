import Modal from '@/ui/modal';
import {
  StyledAvatarUploadBtn,
  StyledDeleteButtonContainer,
  StyledSettingAvatar,
  StyledSettingAvatarContent,
  StyledSettingContainer,
  StyledSettingContent,
  StyledSettingH2,
  StyledSettingInputContainer,
  StyledSettingSidebar,
  StyledSettingSidebarHeader,
  StyledSettingTabContainer,
  StyledSettingTagIconContainer,
  WorkspaceSettingTagItem,
} from './style';
import { EditIcon, UsersIcon, PublishIcon } from '@blocksuite/icons';
import { useState } from 'react';
import { Button } from '@/ui/button';
import Input from '@/ui/input';

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
          {activeTab === ActiveTab.general && <GeneralPage />}
        </StyledSettingContent>
      </StyledSettingContainer>
    </Modal>
  );
};

const GeneralPage = () => {
  return (
    <div>
      <StyledSettingH2 marginTop={56}>Workspace Avatar</StyledSettingH2>
      <StyledSettingAvatarContent>
        <StyledSettingAvatar alt="workspace avatar">W</StyledSettingAvatar>
        <StyledAvatarUploadBtn shape="round">upload</StyledAvatarUploadBtn>
        <Button shape="round">remove</Button>
      </StyledSettingAvatarContent>
      <StyledSettingH2 marginTop={36}>Workspace Name</StyledSettingH2>
      <StyledSettingInputContainer>
        <Input width={327} placeholder="Workspace Name"></Input>
      </StyledSettingInputContainer>
      <StyledSettingH2 marginTop={36}>Workspace Owner</StyledSettingH2>
      <StyledSettingInputContainer>
        <Input width={327} placeholder="Workspace Owner"></Input>
      </StyledSettingInputContainer>
      <StyledDeleteButtonContainer>
        <Button type="danger" shape="circle">
          Delete Workspace
        </Button>
      </StyledDeleteButtonContainer>
    </div>
  );
};
