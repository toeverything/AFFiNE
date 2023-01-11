import { styled } from '@/styles';
import { Modal, ModalWrapper, ModalCloseButton } from '@/ui/modal';
import { Button } from '@/ui/button';
import { useState } from 'react';
import { SignOut } from '@/hooks/mock-data/mock';
import { CreateWorkspaceModal } from '../create-workspace';
import {
  CloudUnsyncedIcon,
  CloudInsyncIcon,
  UsersIcon,
  AddIcon,
} from '@blocksuite/icons';
import { toast } from '@/ui/toast';
import { WorkspaceAvatar } from '@/components/workspace-avatar';
import { useAppState } from '@/providers/app-state-provider';
import { useRouter } from 'next/router';

interface WorkspaceModalProps {
  open: boolean;
  onClose: () => void;
}

export const WorkspaceModal = ({ open, onClose }: WorkspaceModalProps) => {
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);
  // const { confirm } = useConfirm();
  const { workspaceList, currentWorkspace, login, user } = useAppState();
  const router = useRouter();
  return (
    <div>
      <Modal open={open} onClose={onClose}>
        <ModalWrapper
          width={820}
          style={{ padding: '10px', display: 'flex', flexDirection: 'column' }}
        >
          <Header>
            <ContentTitle>My Workspaces</ContentTitle>
            {/* <LanguageMenu /> */}
            <ModalCloseButton
              top={6}
              right={6}
              onClick={() => {
                onClose();
              }}
            />
          </Header>
          <Content>
            <WorkspaceList>
              {workspaceList.map((item, index) => {
                return (
                  <WorkspaceItem
                    onClick={() => {
                      router.replace(`/workspace/${item.id}`);
                      onClose();
                    }}
                    active={item.id === currentWorkspace?.id}
                    key={index}
                  >
                    <span style={{ width: '100px' }}>
                      <div
                        style={{
                          float: 'left',
                          marginTop: '6px',
                          marginLeft: '10px',
                          marginRight: '10px',
                        }}
                      >
                        <WorkspaceAvatar
                          size={50}
                          name={item.name}
                          avatar={item.avatar ?? ''}
                        />
                      </div>

                      <span
                        style={{
                          width: '235px',
                          fontSize: '16px',
                          display: 'inline-block',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          position: 'relative',
                          top: '20px',
                        }}
                      >
                        {item.name || 'AFFiNE'}
                      </span>
                    </span>
                    <span
                      style={{
                        position: 'relative',
                        top: '20px',
                      }}
                    >
                      {(item.provider === 'local' || !item.provider) && (
                        <CloudUnsyncedIcon fontSize={24} />
                      )}
                      {item.provider === 'affine' && (
                        <CloudInsyncIcon fontSize={24} />
                      )}
                      {item.published && <UsersIcon fontSize={24} />}
                    </span>
                    {/* {item.isLocal ? 'isLocal' : ''}/ */}
                  </WorkspaceItem>
                );
              })}
              <li>
                <Button
                  style={{
                    marginTop: '20px',
                  }}
                  type="primary"
                  onClick={() => {
                    setCreateWorkspaceOpen(true);
                  }}
                >
                  <AddIcon
                    style={{
                      fontSize: '20px',
                      top: '5px',
                      position: 'relative',
                      marginRight: '10px',
                    }}
                  />
                  Create Or Import
                </Button>
              </li>
            </WorkspaceList>
            <p style={{ fontSize: '14px', color: '#ccc', margin: '12px 0' }}>
              Tips:Workspace is your virtual space to capture, create and plan
              as just one person or together as a team.
            </p>
          </Content>
          <Footer>
            {!user ? (
              <Button
                onClick={() => {
                  login();
                  toast('login success');
                }}
              >
                Sign in AFFiNE Cloud
              </Button>
            ) : (
              <Button
                onClick={() => {
                  SignOut();
                }}
              >
                Sign out of AFFiNE Cloud
              </Button>
            )}
          </Footer>
          <CreateWorkspaceModal
            open={createWorkspaceOpen}
            onClose={() => {
              setCreateWorkspaceOpen(false);
              onClose();
              // confirm({
              //   title: 'Enable AFFiNE Cloud?',
              //   content: `If enabled, the data in this workspace will be backed up and synchronized via AFFiNE Cloud.`,
              //   confirmText: user ? 'Enable' : 'Sign in and Enable',
              //   cancelText: 'Skip',
              // }).then(confirm => {
              //   if (confirm) {
              //     if (user) {
              //       // workspaceId &&
              //       //   updateWorkspaceMeta(workspaceId, { isPublish: true });
              //     } else {
              //       // login();
              //       // workspaceId &&
              //       //   updateWorkspaceMeta(workspaceId, { isPublish: true });
              //     }
              //   }
              // });
            }}
          ></CreateWorkspaceModal>
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
  padding: '0 20px',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '16px',
  flex: 1,
});

const ContentTitle = styled('span')({
  fontSize: '20px',
  lineHeight: '28px',
  fontWeight: 600,
  textAlign: 'left',
  paddingBottom: '16px',
});

const Footer = styled('div')({
  height: '70px',
  paddingLeft: '24px',
  marginTop: '32px',
  textAlign: 'center',
});

const WorkspaceList = styled('div')({
  display: 'grid',
  gridRowGap: '10px',
  gridColumnGap: '10px',
  fontSize: '16px',
  gridTemplateColumns: 'repeat(2, 1fr)',
});

export const WorkspaceItem = styled.div<{
  active: boolean;
}>(({ theme, active }) => {
  const backgroundColor = active ? theme.colors.hoverBackground : 'transparent';
  return {
    cursor: 'pointer',
    padding: '8px',
    border: '1px solid #eee',
    backgroundColor: backgroundColor,
    ':hover': {
      background: theme.colors.hoverBackground,
    },
  };
});
