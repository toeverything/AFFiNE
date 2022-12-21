import Modal, { ModalCloseButton } from '@/ui/modal';
import {
  StyledAvatarUploadBtn,
  StyledCopyButtonContainer,
  StyledDeleteButtonContainer,
  StyledMemberAvatar,
  StyledMemberButtonContainer,
  StyledMemberEmail,
  StyledMemberInfo,
  StyledMemberListContainer,
  StyledMemberListItem,
  StyledMemberName,
  StyledMemberNameContainer,
  StyledMemberRoleContainer,
  StyledMemberTitleContainer,
  StyledMoreVerticalButton,
  StyledPublishContent,
  StyledPublishCopyContainer,
  StyledPublishExplanation,
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
import {
  EditIcon,
  UsersIcon,
  PublishIcon,
  MoreVerticalIcon,
  EmailIcon,
} from '@blocksuite/icons';
import { useEffect, useState } from 'react';
import { Button } from '@/ui/button';
import Input from '@/ui/input';
import { InviteMembers } from '../invite-members/index';
import {
  getWorkspaceMembers,
  Workspace,
  WorkspaceType,
  Member,
  type RegisteredUser,
} from '@pathfinder/data-services';
import { Avatar } from '@mui/material';

enum ActiveTab {
  'general' = 'general',
  'members' = 'members',
  'publish' = 'publish',
}

type SettingTabProps = {
  activeTab: ActiveTab;
  onTabChange?: (tab: ActiveTab) => void;
};

type WorkspaceSettingProps = {
  isShow: boolean;
  onClose?: () => void;
  workspace?: Workspace;
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

export const WorkspaceSetting = ({
  isShow,
  onClose,
  workspace,
}: WorkspaceSettingProps) => {
  const [activeTab, setActiveTab] = useState<ActiveTab>(ActiveTab.general);
  const handleTabChange = (tab: ActiveTab) => {
    setActiveTab(tab);
  };
  const handleClickClose = () => {
    onClose && onClose();
  };
  const isPrivate = workspace?.type === WorkspaceType.Private;
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
          {activeTab === ActiveTab.general && (
            <GeneralPage workspace={workspace} />
          )}
          {activeTab === ActiveTab.members && workspace && (
            <MembersPage workspace={workspace} />
          )}
          {activeTab === ActiveTab.publish && <PublishPage />}
        </StyledSettingContent>
      </StyledSettingContainer>
    </Modal>
  );
};

const GeneralPage = ({ workspace }: { workspace?: Workspace }) => {
  return (
    <div>
      <StyledSettingH2 marginTop={56}>Workspace Avatar</StyledSettingH2>
      <StyledSettingAvatarContent>
        <StyledSettingAvatar alt="workspace avatar">W</StyledSettingAvatar>
        {/* <StyledAvatarUploadBtn shape="round">upload</StyledAvatarUploadBtn>
        <Button shape="round">remove</Button> */}
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

const MembersPage = ({ workspace }: { workspace: Workspace }) => {
  const [isInviteModalShow, setIsInviteModalShow] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  useEffect(() => {
    getWorkspaceMembers({
      id: workspace.id,
    })
      .then(data => {
        setMembers(data);
      })
      .catch(err => {
        console.log(err);
      });
  });
  return (
    <div>
      <StyledMemberTitleContainer>
        <StyledMemberNameContainer>Users(88) </StyledMemberNameContainer>
        <StyledMemberRoleContainer>Access level</StyledMemberRoleContainer>
      </StyledMemberTitleContainer>
      <StyledMemberListContainer>
        {members.map(member => {
          return (
            <StyledMemberListItem>
              <StyledMemberNameContainer>
                {member.user.type === 'Registered' ? (
                  <Avatar src={member.user.avatar_url}></Avatar>
                ) : (
                  <StyledMemberAvatar alt="member avatar">
                    <EmailIcon></EmailIcon>
                  </StyledMemberAvatar>
                )}

                <StyledMemberInfo>
                  {member.user.type === 'Registered' ? (
                    <StyledMemberName>{member.user.name}</StyledMemberName>
                  ) : (
                    <></>
                  )}
                  <StyledMemberEmail>{member.user.email}</StyledMemberEmail>
                </StyledMemberInfo>
              </StyledMemberNameContainer>
              <StyledMemberRoleContainer>
                Workspace Owner
              </StyledMemberRoleContainer>
              <StyledMoreVerticalButton>
                <MoreVerticalIcon></MoreVerticalIcon>
              </StyledMoreVerticalButton>
            </StyledMemberListItem>
          );
        })}
      </StyledMemberListContainer>
      <StyledMemberButtonContainer>
        <Button
          onClick={() => {
            setIsInviteModalShow(true);
          }}
          type="primary"
          shape="circle"
        >
          Invite Members
        </Button>
        <InviteMembers
          onClose={() => {
            setIsInviteModalShow(false);
          }}
          workspaceId={workspace.id}
          open={isInviteModalShow}
        ></InviteMembers>
      </StyledMemberButtonContainer>
    </div>
  );
};

const PublishPage = () => {
  return (
    <div>
      <StyledPublishContent>
        <StyledPublishExplanation>
          After publishing to the web, everyone can view the content of this
          workspace through the link.
        </StyledPublishExplanation>
        <StyledSettingH2 marginTop={48}>Share with link</StyledSettingH2>
        <StyledPublishCopyContainer>
          <Input
            width={500}
            value={'www.baidu.com/asdsadas/asdsadasd'}
            disabled
          ></Input>
          <StyledCopyButtonContainer>
            <Button type="primary" shape="circle">
              Copy Link
            </Button>
          </StyledCopyButtonContainer>
        </StyledPublishCopyContainer>
      </StyledPublishContent>
      <Button type="primary" shape="circle">
        Publish to web
      </Button>
    </div>
  );
};
