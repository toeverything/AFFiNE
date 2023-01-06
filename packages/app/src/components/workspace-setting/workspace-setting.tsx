import Modal, { ModalCloseButton } from '@/ui/modal';
import {
  StyledSettingContainer,
  StyledSettingContent,
  StyledSettingSidebar,
  StyledSettingSidebarHeader,
  StyledSettingTabContainer,
  StyledSettingTagIconContainer,
  WorkspaceSettingTagItem,
} from './style';
import {
  EditIcon,
  UsersIcon,
  PublishIcon,
  CloudInsyncIcon,
} from '@blocksuite/icons';
import { useEffect, useState } from 'react';
import { GeneralPage } from './general';
import { getActiveWorkspace } from '@/hooks/mock-data/mock';
import { MembersPage } from './MembersPage';
import { PublishPage } from './PublishPage';
import { SyncPage } from './SyncPage';
import { useTemporaryHelper } from '@/providers/temporary-helper-provider';

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

export const WorkspaceSetting = ({
  isShow,
  onClose,
}: WorkspaceSettingProps) => {
  // const { workspaces } = useAppState();
  const [activeTab, setActiveTab] = useState<ActiveTab>(ActiveTab.general);
  const handleTabChange = (tab: ActiveTab) => {
    setActiveTab(tab);
  };

  const { currentWorkspace } = useTemporaryHelper();
  const handleClickClose = () => {
    onClose && onClose();
  };
  const isOwner = true;
  useEffect(() => {
    // reset tab when modal is closed
    if (!isShow) {
      setActiveTab(ActiveTab.general);
    }
  }, [isShow]);
  return (
    <Modal open={isShow}>
      <StyledSettingContainer>
        <ModalCloseButton onClick={handleClickClose} />
        {isOwner ? (
          <StyledSettingSidebar>
            <StyledSettingSidebarHeader>
              Workspace Settings
            </StyledSettingSidebarHeader>
            <WorkspaceSettingTab
              activeTab={activeTab}
              onTabChange={handleTabChange}
            />
          </StyledSettingSidebar>
        ) : null}
        <StyledSettingContent>
          {activeTab === ActiveTab.general && (
            <GeneralPage workspace={currentWorkspace} />
          )}
          {activeTab === ActiveTab.sync && (
            <SyncPage workspace={currentWorkspace} />
          )}
          {activeTab === ActiveTab.members && currentWorkspace && (
            <MembersPage workspace={currentWorkspace} />
          )}
          {activeTab === ActiveTab.publish && (
            <PublishPage workspace={currentWorkspace} />
          )}
        </StyledSettingContent>
      </StyledSettingContainer>
    </Modal>
  );
};
