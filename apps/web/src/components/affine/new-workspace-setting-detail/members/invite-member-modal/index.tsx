import {
  Button,
  Input,
  Modal,
  ModalCloseButton,
  ModalWrapper,
  MuiAvatar,
  styled,
} from '@affine/component';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { EmailIcon } from '@blocksuite/icons';
import type React from 'react';
import { Suspense, useCallback, useState } from 'react';

import { useMembers } from '../../../../../hooks/affine/use-members';
import { useUsersByEmail } from '../../../../../hooks/affine/use-users-by-email';

interface LoginModalProps {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  onInviteSuccess: () => void;
}

const gmailReg =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@(gmail|example)\.(com|org)$/;

const Result: React.FC<{
  workspaceId: string;
  queryEmail: string;
}> = ({ workspaceId, queryEmail }) => {
  const users = useUsersByEmail(workspaceId, queryEmail);
  const firstUser = users?.at(0) ?? null;
  if (!firstUser || !firstUser.email) {
    return null;
  }
  return (
    <Members>
      <Member>
        {firstUser.avatar_url ? (
          <MuiAvatar src={firstUser.avatar_url}></MuiAvatar>
        ) : (
          <MemberIcon>
            <EmailIcon></EmailIcon>
          </MemberIcon>
        )}
        <Email>{firstUser.email}</Email>
        {/* <div>invited</div> */}
      </Member>
    </Members>
  );
};

export const InviteMemberModal = ({
  open,
  onClose,
  onInviteSuccess,
  workspaceId,
}: LoginModalProps) => {
  const { inviteMember } = useMembers(workspaceId);
  const [email, setEmail] = useState<string>('');
  const [showMemberPreview, setShowMemberPreview] = useState(false);
  const t = useAFFiNEI18N();
  const inputChange = useCallback((value: string) => {
    setEmail(value);
  }, []);
  return (
    <div>
      <Modal open={open} onClose={onClose}>
        <ModalWrapper width={460} height={236}>
          <Header>
            <ModalCloseButton
              onClick={() => {
                onClose();
                setEmail('');
              }}
            />
          </Header>
          <Content>
            <ContentTitle>{t['Invite Members']()}</ContentTitle>
            <InviteBox>
              <Input
                data-testid="invite-member-input"
                width={360}
                value={email}
                onChange={inputChange}
                onFocus={useCallback(() => {
                  setShowMemberPreview(true);
                }, [])}
                onBlur={useCallback(() => {
                  setShowMemberPreview(false);
                }, [])}
                placeholder={t['Invite placeholder']()}
              />
              {showMemberPreview && gmailReg.test(email) && (
                <Suspense fallback="loading...">
                  <Result workspaceId={workspaceId} queryEmail={email} />
                </Suspense>
              )}
            </InviteBox>
          </Content>
          <Footer>
            <Button
              data-testid="invite-member-button"
              disabled={!gmailReg.test(email)}
              shape="circle"
              type="primary"
              style={{
                width: '364px',
                height: '38px',
                borderRadius: '40px',
              }}
              onClick={async () => {
                await inviteMember(email);
                setEmail('');
                onInviteSuccess();
              }}
            >
              {t['Invite']()}
            </Button>
          </Footer>
        </ModalWrapper>
      </Modal>
    </div>
  );
};

const Header = styled('div')({
  position: 'relative',
  height: '44px',
});

const Content = styled('div')({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
});

const ContentTitle = styled('h1')({
  fontSize: '20px',
  lineHeight: '28px',
  fontWeight: 600,
  textAlign: 'center',
  paddingBottom: '16px',
});

const Footer = styled('div')({
  height: '102px',
  margin: '32px 0',
  textAlign: 'center',
});

const InviteBox = styled('div')({
  position: 'relative',
});

const Members = styled('div')(() => {
  return {
    position: 'absolute',
    width: '100%',
    background: 'var(--affine-background-primary-color)',
    textAlign: 'left',
    zIndex: 1,
    borderRadius: '0px 10px 10px 10px',
    height: '56px',
    padding: '8px 12px',
    input: {
      '&::placeholder': {
        color: 'var(--affine-placeholder-color)',
      },
    },
  };
});

// const NoFind = styled('div')(({ theme }) => {
//   return {
//     color: 'var(--affine-icon-color)',
//     fontSize: 'var(--affine-font-sm)',
//     lineHeight: '40px',
//     userSelect: 'none',
//     width: '100%',
//   };
// });

const Member = styled('div')(() => {
  return {
    color: 'var(--affine-icon-color)',
    fontSize: 'var(--affine-font-sm)',
    lineHeight: '40px',
    userSelect: 'none',
    display: 'flex',
  };
});

const MemberIcon = styled('div')(() => {
  return {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    color: 'var(--affine-primary-color)',
    background: '#F5F5F5',
    textAlign: 'center',
    lineHeight: '45px',
    // icon size
    fontSize: '20px',
    overflow: 'hidden',
    img: {
      width: '100%',
      height: '100%',
    },
  };
});

const Email = styled('div')(() => {
  return {
    flex: '1',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    marginLeft: '8px',
  };
});
