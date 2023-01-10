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
import { MembersPage } from './MembersPage';
import { PublishPage } from './PublishPage';
import { ExportPage } from './ExportPage';
import { SyncPage } from './SyncPage';
import { useAppState } from '@/providers/app-state-provider';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
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
        {t('General')}
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
        {t('Sync')}
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
        {t('Collaboration')}
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
        {t('Publish')}
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
        {t('Export')}
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
  const { t } = useTranslation();
  const { currentMetaWorkSpace } = useAppState();
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
              {t('Workspace Settings')}
            </StyledSettingSidebarHeader>
            <WorkspaceSettingTab
              activeTab={activeTab}
              onTabChange={handleTabChange}
            />
          </StyledSettingSidebar>
        ) : null}
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
    </Modal>
  );
};
