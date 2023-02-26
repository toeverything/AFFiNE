import { Button, Wrapper } from '@affine/component';
import { useTranslation } from '@affine/i18n';
import React, { useState } from 'react';

import { RemWorkspaceFlavour } from '../../../../../shared';
import { PanelProps } from '../../index';
import { InviteMemberModal } from './invite-member-modal';
import {
  StyledMemberButtonContainer,
  StyledMemberContainer,
  StyledMemberListContainer,
  StyledMemberNameContainer,
  StyledMemberRoleContainer,
  StyledMemberTitleContainer,
} from './style';

export const CollaborationPanel: React.FC<PanelProps> = ({ workspace }) => {
  const [isInviteModalShow, setIsInviteModalShow] = useState(false);
  // const { members, removeMember, loaded } = useMembers();
  // const { triggerEnableWorkspaceModal } = useModal();
  const { t } = useTranslation();

  if (workspace.flavour === RemWorkspaceFlavour.AFFINE) {
    return (
      <>
        <StyledMemberContainer>
          <ul>
            <StyledMemberTitleContainer>
              <StyledMemberNameContainer>
                {/*{t('Users')} ({members.length})*/}
              </StyledMemberNameContainer>
              <StyledMemberRoleContainer>
                {t('Access level')}
              </StyledMemberRoleContainer>
              <div style={{ width: '24px', paddingRight: '48px' }}></div>
            </StyledMemberTitleContainer>
          </ul>

          <StyledMemberListContainer>
            {/*{!loaded && (*/}
            {/*  <FlexWrapper justifyContent="center">*/}
            {/*    <Loading size={25} />*/}
            {/*  </FlexWrapper>*/}
            {/*)}*/}
            {/*{loaded && members.length > 0 && (*/}
            {/*  <>*/}
            {/*    {members.map((member, index) => {*/}
            {/*      const user = Object.assign(*/}
            {/*        {*/}
            {/*          avatar_url: '',*/}
            {/*          email: '',*/}
            {/*          id: '',*/}
            {/*          name: '',*/}
            {/*        },*/}
            {/*        member.user*/}
            {/*      );*/}
            {/*      return (*/}
            {/*        <StyledMemberListItem key={index}>*/}
            {/*          <StyledMemberNameContainer>*/}
            {/*            <StyledMemberAvatar*/}
            {/*              alt="member avatar"*/}
            {/*              src={user.avatar_url}*/}
            {/*            >*/}
            {/*              <EmailIcon />*/}
            {/*            </StyledMemberAvatar>*/}

            {/*            <StyledMemberInfo>*/}
            {/*              <StyledMemberName>{user.name}</StyledMemberName>*/}
            {/*              <StyledMemberEmail>*/}
            {/*                {member.user.email}*/}
            {/*              </StyledMemberEmail>*/}
            {/*            </StyledMemberInfo>*/}
            {/*          </StyledMemberNameContainer>*/}
            {/*          <StyledMemberRoleContainer>*/}
            {/*            {member.accepted*/}
            {/*              ? member.type !== 99*/}
            {/*                ? t('Member')*/}
            {/*                : t('Owner')*/}
            {/*              : t('Pending')}*/}
            {/*          </StyledMemberRoleContainer>*/}
            {/*          <StyledMoreVerticalButton>*/}
            {/*            {member.type === 99 ? (*/}
            {/*              <></>*/}
            {/*            ) : (*/}
            {/*              <Menu*/}
            {/*                content={*/}
            {/*                  <>*/}
            {/*                    <MenuItem*/}
            {/*                      onClick={async () => {*/}
            {/*                        // FIXME: remove ignore*/}

            {/*                        // @ts-ignore*/}
            {/*                        await removeMember(member.id);*/}
            {/*                        toast(*/}
            {/*                          t('Member has been removed', {*/}
            {/*                            name: user.name,*/}
            {/*                          })*/}
            {/*                        );*/}
            {/*                      }}*/}
            {/*                      icon={<DeleteTemporarilyIcon />}*/}
            {/*                    >*/}
            {/*                      {t('Remove from workspace')}*/}
            {/*                    </MenuItem>*/}
            {/*                  </>*/}
            {/*                }*/}
            {/*                placement="bottom-end"*/}
            {/*                disablePortal={true}*/}
            {/*                trigger="click"*/}
            {/*              >*/}
            {/*                <IconButton>*/}
            {/*                  <MoreVerticalIcon />*/}
            {/*                </IconButton>*/}
            {/*              </Menu>*/}
            {/*            )}*/}
            {/*          </StyledMoreVerticalButton>*/}
            {/*        </StyledMemberListItem>*/}
            {/*      );*/}
            {/*    })}*/}
            {/*  </>*/}
            {/*)}*/}
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
          </StyledMemberButtonContainer>
        </StyledMemberContainer>
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
      </>
    );
  }

  return (
    <>
      <Wrapper marginBottom="32px">{t('Collaboration Description')}</Wrapper>
      <Button
        type="light"
        shape="circle"
        onClick={async () => {
          // triggerEnableWorkspaceModal();
        }}
      >
        {t('Enable AFFiNE Cloud')}
      </Button>
    </>
  );
};
