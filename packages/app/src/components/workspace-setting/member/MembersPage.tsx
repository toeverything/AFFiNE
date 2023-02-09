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
  StyledMemberContainer,
} from './style';
import { Wrapper } from '@affine/component';
import { MoreVerticalIcon, EmailIcon, TrashIcon } from '@blocksuite/icons';
import { useState } from 'react';
import { Button, IconButton } from '@affine/component';
import { InviteMemberModal } from './InviteMemberModal';
import { Menu, MenuItem } from '@affine/component';
import { Empty } from '@affine/component';
import { WorkspaceUnit } from '@affine/datacenter';
import { useConfirm } from '@/providers/ConfirmProvider';
import { toast } from '@affine/component';
import useMembers from '@/hooks/use-members';
import Loading from '@/components/loading';
import { FlexWrapper } from '@affine/component';
import { useTranslation } from '@affine/i18n';
import { EnableWorkspaceButton } from '@/components/enable-workspace';

export const MembersPage = ({ workspace }: { workspace: WorkspaceUnit }) => {
  const [isInviteModalShow, setIsInviteModalShow] = useState(false);
  const { members, removeMember, loaded } = useMembers();
  const { t } = useTranslation();
  const { confirm } = useConfirm();

  if (workspace.provider === 'affine') {
    return (
      <StyledMemberContainer>
        <StyledMemberListContainer>
          {!loaded && (
            <FlexWrapper justifyContent="center">
              <Loading size={25} />
            </FlexWrapper>
          )}
          {loaded && members.length === 0 && (
            <Empty width={648} sx={{ marginTop: '60px' }} height={300} />
          )}
          {loaded && members.length > 0 && (
            <>
              <StyledMemberTitleContainer>
                <StyledMemberNameContainer>
                  {t('Users')} ({members.length})
                </StyledMemberNameContainer>
                <StyledMemberRoleContainer>
                  {t('Access level')}
                </StyledMemberRoleContainer>
                <div style={{ width: '24px', paddingRight: '48px' }}></div>
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
                          ? t('Member')
                          : t('Owner')
                        : t('Pending')}
                    </StyledMemberRoleContainer>
                    <StyledMoreVerticalButton>
                      {member.type === 99 ? (
                        <></>
                      ) : (
                        <Menu
                          content={
                            <>
                              <MenuItem
                                onClick={async () => {
                                  const confirmRemove = await confirm({
                                    title: t('Delete Member?'),
                                    content: t('will delete member'),
                                    confirmText: t('Delete'),
                                    confirmType: 'danger',
                                  });

                                  if (!confirmRemove) {
                                    return;
                                  }
                                  await removeMember(member.id);
                                  toast(
                                    t('Member has been removed', {
                                      name: user.name,
                                    })
                                  );
                                }}
                                icon={<TrashIcon />}
                              >
                                {t('Delete')}
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
                      )}
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
      </StyledMemberContainer>
    );
  }

  return (
    <Wrapper
      style={{
        fontWeight: '500',
        fontSize: '18px',
      }}
    >
      <Wrapper marginBottom="32px">{t('Collaboration Description')}</Wrapper>
      <EnableWorkspaceButton />
    </Wrapper>
  );
};
