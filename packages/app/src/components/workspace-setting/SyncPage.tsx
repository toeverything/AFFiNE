import {
  StyledPublishContent,
  StyledPublishCopyContainer,
  StyledPublishExplanation,
} from './style';
import { DownloadIcon } from '@blocksuite/icons';
import { useEffect, useState } from 'react';
import { Button } from '@/ui/button';
import { Menu, MenuItem } from '@/ui/menu';
import {
  deleteMember,
  getActiveWorkspace,
  updateWorkspaceMeta,
  Workspace,
} from '@/hooks/mock-data/mock';

export const SyncPage = ({ workspace }: { workspace: Workspace }) => {
  const [workspaceType, setWorkspaceType] = useState('local');
  useEffect(() => {
    setType();
  });
  const setType = () => {
    const ACTIVEworkspace = getActiveWorkspace();
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
            </StyledPublishCopyContainer>
          </>
        ) : (
          <>
            <StyledPublishExplanation>
              <code>{workspace.name}</code> is Cloud Workspace. All data will be
              synchronized and saved to the AFFiNE
            </StyledPublishExplanation>
            <StyledPublishCopyContainer>
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
            </StyledPublishCopyContainer>
          </>
        )}
      </StyledPublishContent>
    </div>
  );
};
