import Modal, { ModalCloseButton } from '@/ui/modal';
import {
  StyledCopyButtonContainer,
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
  StyledSettingContainer,
  StyledSettingContent,
  StyledSettingH2,
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
  TrashIcon,
} from '@blocksuite/icons';
import { useCallback, useEffect, useState } from 'react';
import { Button, IconButton } from '@/ui/button';
import Input from '@/ui/input';
import { InviteMembers } from '../invite-members/index';
import { Workspace, Member, getDataCenter } from '@affine/datacenter';
import { Avatar } from '@mui/material';
import { Menu, MenuItem } from '@/ui/menu';
import { toast } from '@/ui/toast';
import { Empty } from '@/ui/empty';
import { useAppState } from '@/providers/app-state-provider';
import { WorkspaceDetails } from '../workspace-slider-bar/WorkspaceSelector/SelectorPopperContent';
import { GeneralPage } from './general';

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
  workspace: Workspace;
  owner: WorkspaceDetails[string]['owner'];
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
  owner,
}: WorkspaceSettingProps) => {
  const { user, workspaces } = useAppState();
  const [activeTab, setActiveTab] = useState<ActiveTab>(ActiveTab.general);
  const handleTabChange = (tab: ActiveTab) => {
    setActiveTab(tab);
  };
  const handleClickClose = () => {
    onClose && onClose();
  };
  const isOwner = user && owner.id === user.id;
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
            <GeneralPage
              workspace={workspace}
              owner={owner}
              workspaces={workspaces}
            />
          )}
          {activeTab === ActiveTab.members && workspace && (
            <MembersPage workspace={workspace} />
          )}
          {activeTab === ActiveTab.publish && (
            <PublishPage workspace={workspace} />
          )}
        </StyledSettingContent>
      </StyledSettingContainer>
    </Modal>
  );
};

const MembersPage = ({ workspace }: { workspace: Workspace }) => {
  const [isInviteModalShow, setIsInviteModalShow] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const refreshMembers = useCallback(() => {
    getDataCenter()
      .then(dc =>
        dc.apis.getWorkspaceMembers({
          id: workspace.id,
        })
      )
      .then(data => {
        setMembers(data);
      })
      .catch(err => {
        console.log(err);
      });
  }, [workspace.id]);
  useEffect(() => {
    refreshMembers();
  }, [refreshMembers]);

  return (
    <div>
      <StyledMemberTitleContainer>
        <StyledMemberNameContainer>
          Users({members.length})
        </StyledMemberNameContainer>
        <StyledMemberRoleContainer>Access level</StyledMemberRoleContainer>
      </StyledMemberTitleContainer>
      <StyledMemberListContainer>
        {members.length === 0 && (
          <Empty width={648} sx={{ marginTop: '60px' }} height={300}></Empty>
        )}
        {members.length ? (
          members.map(member => {
            return (
              <StyledMemberListItem key={member.id}>
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
                  {member.accepted
                    ? member.type !== 99
                      ? 'Member'
                      : 'Workspace Owner'
                    : 'Pending'}
                </StyledMemberRoleContainer>
                <StyledMoreVerticalButton>
                  <Menu
                    content={
                      <>
                        <MenuItem
                          onClick={() => {
                            // confirm({
                            //   title: 'Delete Member?',
                            //   content: `will delete member`,
                            //   confirmText: 'Delete',
                            //   confirmType: 'danger',
                            // }).then(confirm => {
                            getDataCenter()
                              .then(dc =>
                                dc.apis.removeMember({
                                  permissionId: member.id,
                                })
                              )
                              .then(() => {
                                // console.log('data: ', data);
                                toast('Moved to Trash');
                                refreshMembers();
                              });
                            // });
                          }}
                          icon={<TrashIcon />}
                        >
                          Delete
                        </MenuItem>
                      </>
                    }
                    placement="bottom-end"
                    disablePortal={true}
                  >
                    <IconButton>
                      <MoreVerticalIcon />
                    </IconButton>
                  </Menu>
                </StyledMoreVerticalButton>
              </StyledMemberListItem>
            );
          })
        ) : (
          <></>
        )}
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
          onInviteSuccess={() => {
            refreshMembers();
          }}
          workspaceId={workspace.id}
          open={isInviteModalShow}
        ></InviteMembers>
      </StyledMemberButtonContainer>
    </div>
  );
};

const PublishPage = ({ workspace }: { workspace: Workspace }) => {
  const shareUrl = window.location.host + '/workspace/' + workspace.id;
  const [publicStatus, setPublicStatus] = useState<boolean | null>(
    workspace.public
  );
  const togglePublic = (flag: boolean) => {
    getDataCenter()
      .then(dc =>
        dc.apis.updateWorkspace({
          id: workspace.id,
          public: flag,
        })
      )
      .then(data => {
        setPublicStatus(data?.public);
        toast('Updated Public Status Success');
      });
  };
  const copyUrl = () => {
    navigator.clipboard.writeText(shareUrl);
    toast('Copied url to clipboard');
  };
  return (
    <div>
      <StyledPublishContent>
        {publicStatus ? (
          <>
            <StyledPublishExplanation>
              The current workspace has been published to the web, everyone can
              view the contents of this workspace through the link.
            </StyledPublishExplanation>
            <StyledSettingH2 marginTop={48}>Share with link</StyledSettingH2>
            <StyledPublishCopyContainer>
              <Input width={500} value={shareUrl} disabled={true}></Input>
              <StyledCopyButtonContainer>
                <Button onClick={copyUrl} type="primary" shape="circle">
                  Copy Link
                </Button>
              </StyledCopyButtonContainer>
            </StyledPublishCopyContainer>
          </>
        ) : (
          <StyledPublishExplanation>
            After publishing to the web, everyone can view the content of this
            workspace through the link.
          </StyledPublishExplanation>
        )}
      </StyledPublishContent>
      {!publicStatus ? (
        <Button
          onClick={() => {
            togglePublic(true);
          }}
          type="primary"
          shape="circle"
        >
          Publish to web
        </Button>
      ) : (
        <Button
          onClick={() => {
            togglePublic(false);
          }}
          type="primary"
          shape="circle"
        >
          Stop publishing
        </Button>
      )}
    </div>
  );
};
