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
  DownloadIcon,
  CloudInsyncIcon,
} from '@blocksuite/icons';
import { useEffect, useState } from 'react';
import { Button, IconButton } from '@/ui/button';
import Input from '@/ui/input';
import { InviteMembers } from '../invite-members/index';
// import { Member, getDataCenter } from '@affine/datacenter';
// import { Avatar } from '@mui/material';
import { Menu, MenuItem } from '@/ui/menu';
import { toast } from '@/ui/toast';
import { Empty } from '@/ui/empty';
// import { useAppState } from '@/providers/app-state-provider';
import { GeneralPage } from './general';
import {
  deleteMember,
  getActiveWorkspace,
  getMembers,
  getUserInfo,
  Login,
  setWorkspacePublish,
  updateWorkspaceMeta,
  User,
  Workspace,
} from '@/hooks/mock-data/mock';

enum ActiveTab {
  'general' = 'general',
  'members' = 'members',
  'publish' = 'publish',
  'sync' = 'sync',
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

  const workspace = getActiveWorkspace();
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
            <GeneralPage workspace={workspace} />
          )}
          {activeTab === ActiveTab.sync && <SyncPage workspace={workspace} />}
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
  const [members, setMembers] = useState<User[]>([]);
  const [userInfo, setUserInfo] = useState<User>();
  // const refreshMembers = useCallback(() => {
  //   getDataCenter()
  //     .then(dc =>
  //       dc.apis.getWorkspaceMembers({
  //         id: workspace.id,
  //       })
  //     )
  //     .then(data => {
  //       setMembers(data);
  //     })
  //     .catch(err => {
  //       console.log(err);
  //     });
  // }, [workspace.id]);

  useEffect(() => {
    setUser();
    setMembersList();
    // refreshMembers();
  }, []);

  const setUser = () => {
    const user = getUserInfo();
    user && setUserInfo(user);
  };
  const setMembersList = () => {
    const members = getMembers(workspace.id);
    members && setMembers(members);
  };

  return (
    <div>
      {userInfo ? (
        <>
          <StyledMemberTitleContainer>
            <StyledMemberNameContainer>
              Users({members.length})
            </StyledMemberNameContainer>
            <StyledMemberRoleContainer>Access level</StyledMemberRoleContainer>
          </StyledMemberTitleContainer>
          <StyledMemberListContainer>
            {members.length === 0 && (
              <Empty
                width={648}
                sx={{ marginTop: '60px' }}
                height={300}
              ></Empty>
            )}
            {members.length ? (
              members.map((member, index) => {
                return (
                  <StyledMemberListItem key={index}>
                    <StyledMemberNameContainer>
                      <StyledMemberAvatar alt="member avatar">
                        <EmailIcon></EmailIcon>
                      </StyledMemberAvatar>

                      <StyledMemberInfo>
                        <StyledMemberName>{member.name}</StyledMemberName>

                        <StyledMemberEmail>{member.email}</StyledMemberEmail>
                      </StyledMemberInfo>
                    </StyledMemberNameContainer>
                    <StyledMemberRoleContainer>
                      {/* {member.accepted
                        ? member.type !== 99
                          ? 'Member'
                          : 'Workspace Owner'
                        : 'Pending'} */}
                      Pending
                    </StyledMemberRoleContainer>
                    <StyledMoreVerticalButton>
                      <Menu
                        content={
                          <>
                            <MenuItem
                              onClick={() => {
                                deleteMember(workspace.id, 0);
                                setMembersList();
                                // confirm({
                                //   title: 'Delete Member?',
                                //   content: `will delete member`,
                                //   confirmText: 'Delete',
                                //   confirmType: 'danger',
                                // }).then(confirm => {
                                // getDataCenter()
                                //   .then(dc =>
                                //     dc.apis.removeMember({
                                //       permissionId: member.id,
                                //     })
                                //   )
                                //   .then(() => {
                                //     // console.log('data: ', data);
                                //     toast('Moved to Trash');
                                //     // refreshMembers();
                                //   });
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
                setMembersList();
                setIsInviteModalShow(false);
                // refreshMembers();
              }}
              workspaceId={workspace.id}
              open={isInviteModalShow}
            ></InviteMembers>
          </StyledMemberButtonContainer>
        </>
      ) : (
        <>
          <div>
            Collaborating with other members requires AFFiNE Cloud service.
          </div>
          <div>
            <Button
              onClick={() => {
                Login();
                setUser();
              }}
            >
              Enable AFFiNE Cloud
            </Button>
          </div>
        </>
      )}
    </div>
  );
};

const PublishPage = ({ workspace }: { workspace: Workspace }) => {
  const shareUrl =
    window.location.host + '/workspace/' + workspace.id + '?share=true';
  const [publicStatus, setPublicStatus] = useState<boolean | null>(
    workspace.isPublish ?? false
  );
  const togglePublic = (flag: boolean) => {
    const isPublic = setWorkspacePublish(workspace.id, flag);
    setPublicStatus(isPublic);
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
const SyncPage = ({ workspace }: { workspace: Workspace }) => {
  const [workspaceType, setWorkspaceType] = useState('local');
  useEffect(() => {
    setType();
  });
  const setType = () => {
    const ACTIVEworkspace = getActiveWorkspace();
    console.log('ACTIVEworkspace: ', ACTIVEworkspace);
    ACTIVEworkspace && setWorkspaceType(ACTIVEworkspace.type);
  };
  return (
    <div>
      <StyledPublishContent>
        {workspaceType === 'local' ? (
          <>
            <StyledPublishExplanation>
              {workspace.name} is Local Workspace. All data is stored on the
              current device. You can enable AFFiNE Cloud for this workspace to
              keep data in sync with the cloud.
            </StyledPublishExplanation>

            <StyledPublishCopyContainer>
              <StyledCopyButtonContainer>
                <Button
                  onClick={() => {
                    updateWorkspaceMeta(workspace.id, {
                      type: 'cloud',
                    });
                    setType();
                  }}
                  type="primary"
                  shape="circle"
                >
                  Enable AFFiNE Cloud
                </Button>
              </StyledCopyButtonContainer>
            </StyledPublishCopyContainer>
          </>
        ) : (
          <StyledPublishExplanation>
            {workspace.name} is Cloud Workspace. All data will be synchronized
            and saved to the AFFiNE account
            <div>
              <Menu
                content={
                  <>
                    <MenuItem
                      onClick={() => {
                        deleteMember(workspace.id, 0);
                      }}
                      icon={<DownloadIcon />}
                    >
                      Download core data to device
                    </MenuItem>
                    <MenuItem
                      onClick={() => {
                        deleteMember(workspace.id, 0);
                      }}
                      icon={<DownloadIcon />}
                    >
                      Download all data to device
                    </MenuItem>
                  </>
                }
                placement="bottom-end"
                disablePortal={true}
              >
                <Button>Download all data to device</Button>
              </Menu>
            </div>
          </StyledPublishExplanation>
        )}
      </StyledPublishContent>
    </div>
  );
};
