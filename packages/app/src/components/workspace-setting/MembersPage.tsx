import {
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
} from './style';
import { MoreVerticalIcon, EmailIcon, TrashIcon } from '@blocksuite/icons';
import { useEffect, useState } from 'react';
import { Button, IconButton } from '@/ui/button';
import { InviteMembers } from '../invite-members/index';
import { Menu, MenuItem } from '@/ui/menu';
import { Empty } from '@/ui/empty';
import {
  deleteMember,
  getMembers,
  User,
  Workspace,
} from '@/hooks/mock-data/mock';
import { useTemporaryHelper } from '@/providers/temporary-helper-provider';
import { StyledMemberWarp } from './general/style';
import { useConfirm } from '@/providers/confirm-provider';

// import { useAppState } from '@/providers/app-state-provider';
export const MembersPage = ({ workspace }: { workspace: Workspace }) => {
  const [isInviteModalShow, setIsInviteModalShow] = useState(false);
  const [members, setMembers] = useState<User[]>([]);
  const { user, login, updateWorkspaceMeta } = useTemporaryHelper();
  const { confirm } = useConfirm();
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
  const setMembersList = () => {
    const members = getMembers(workspace.id);
    members && setMembers(members);
  };
  useEffect(() => {
    setMembersList();
    // refreshMembers();
  });

  return (
    <div>
      {workspace.type === 'cloud' ? (
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
        <StyledMemberWarp>
          <div style={{ flex: 1 }}>
            Collaborating with other members requires AFFiNE Cloud service.
          </div>
          <div style={{ height: '40px' }}>
            <Button
              type="primary"
              shape="circle"
              onClick={() => {
                confirm({
                  title: 'Enable AFFiNE Cloud?',
                  content: `If enabled, the data in this workspace will be backed up and synchronized via AFFiNE Cloud.`,
                  confirmText: user ? 'Enable' : 'Sign in and Enable',
                  cancelText: 'Skip',
                }).then(confirm => {
                  if (confirm) {
                    if (user) {
                      updateWorkspaceMeta(workspace.id, { isPublish: true });
                    } else {
                      login();
                      updateWorkspaceMeta(workspace.id, { isPublish: true });
                    }
                  }
                });
              }}
            >
              Enable AFFiNE Cloud
            </Button>
          </div>
        </StyledMemberWarp>
      )}
    </div>
  );
};
