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
  StyledPublishExplanation,
  StyledMemberWarp,
} from './style';
import { MoreVerticalIcon, EmailIcon, TrashIcon } from '@blocksuite/icons';
import { useState } from 'react';
import { Button, IconButton } from '@/ui/button';
import { InviteMemberModal } from './InviteMemberModal';
import { Menu, MenuItem } from '@/ui/menu';
import { Empty } from '@/ui/empty';
import { WorkspaceUnit } from '@affine/datacenter';
import { useTemporaryHelper } from '@/providers/temporary-helper-provider';
import { useConfirm } from '@/providers/ConfirmProvider';
import { toast } from '@/ui/toast';
import useMembers from '@/hooks/use-members';
import Loading from '@/components/loading';
import { Wrapper } from '@/ui/layout';
import { useTranslation } from '@affine/i18n';

export const MembersPage = ({ workspace }: { workspace: WorkspaceUnit }) => {
  const [isInviteModalShow, setIsInviteModalShow] = useState(false);
  const { members, removeMember, loaded } = useMembers();
  const { t } = useTranslation();
  // FIXME: DELETE THIS
  const { user, login, updateWorkspaceMeta } = useTemporaryHelper();
  const { confirm } = useConfirm();

  if (workspace.provider === 'affine') {
    return (
      <>
        <StyledMemberListContainer>
          {!loaded && (
            <Wrapper justifyContent="center">
              <Loading size={25} />
            </Wrapper>
          )}
          {loaded && members.length === 0 && (
            <Empty width={648} sx={{ marginTop: '60px' }} height={300} />
          )}
          {loaded && members.length && (
            <>
              <StyledMemberTitleContainer>
                <StyledMemberNameContainer>
                  {t('Users')} ({members.length})
                </StyledMemberNameContainer>
                <StyledMemberRoleContainer>
                  {t('Access level')}
                </StyledMemberRoleContainer>
              </StyledMemberTitleContainer>
              {members.map((member, index) => {
                const user = Object.assign(
                  {
                    avatar_url: '',
                    email: '',
                    id: '',
                    name: '',
                  },
                  member.user
                );
                return (
                  <StyledMemberListItem key={index}>
                    <StyledMemberNameContainer>
                      <StyledMemberAvatar
                        alt="member avatar"
                        src={user.avatar_url}
                      >
                        <EmailIcon />
                      </StyledMemberAvatar>

                      <StyledMemberInfo>
                        <StyledMemberName>{user.name}</StyledMemberName>
                        <StyledMemberEmail>
                          {member.user.email}
                        </StyledMemberEmail>
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
                              onClick={async () => {
                                const confirmRemove = await confirm({
                                  title: 'Delete Member?',
                                  content: `will delete member`,
                                  confirmText: 'Delete',
                                  confirmType: 'danger',
                                });

                                if (!confirmRemove) {
                                  return;
                                }
                                await removeMember(member.id);
                                toast(`${user.name} has been removed`);
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
              })}
            </>
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
            {t('Invite Members')}
          </Button>
          <InviteMemberModal
            onClose={() => {
              setIsInviteModalShow(false);
            }}
            onInviteSuccess={() => {
              setIsInviteModalShow(false);
              // refreshMembers();
            }}
            workspaceId={workspace.id}
            open={isInviteModalShow}
          ></InviteMemberModal>
        </StyledMemberButtonContainer>
      </>
    );
  }

  return (
    <StyledMemberWarp>
      <>{t('Collaboration Description')}</>
      <StyledPublishExplanation>
        <Button
          type="primary"
          shape="circle"
          onClick={() => {
            confirm({
              title: `${t('Enable AFFiNE Cloud')}?`,
              content: t('Enable AFFiNE Cloud Description'),
              confirmText: user ? t('Enable') : t('Sign in and Enable'),
              cancelText: t('Skip'),
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
          {t('Enable AFFiNE Cloud')}
        </Button>
      </StyledPublishExplanation>
    </StyledMemberWarp>
  );
};
