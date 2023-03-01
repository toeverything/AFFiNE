import React from 'react';

import { RemWorkspace } from '../../../../shared';
import { WorkspaceAvatar } from '../../workspace-avatar';
import { SelectorWrapper, WorkspaceName } from './styles';

export type WorkspaceSelectorProps = {
  currentWorkspace: RemWorkspace | null;
  onClick: () => void;
};

export const WorkspaceSelector: React.FC<WorkspaceSelectorProps> = ({
  currentWorkspace,
  onClick,
}) => {
  let name = 'Untitled Workspace';
  if (currentWorkspace) {
    if (currentWorkspace.flavour === 'affine') {
      if (currentWorkspace.firstBinarySynced) {
        name = currentWorkspace.blockSuiteWorkspace.meta.name;
      }
    } else if (currentWorkspace.flavour === 'local') {
      name = currentWorkspace.blockSuiteWorkspace.meta.name;
    }
  }
  return (
    <>
      <SelectorWrapper onClick={onClick} data-testid="current-workspace">
        <WorkspaceAvatar
          data-testid="workspace-avatar"
          style={{
            flexShrink: 0,
          }}
          size={32}
          workspace={currentWorkspace}
        />
        <WorkspaceName data-testid="workspace-name">{name}</WorkspaceName>
      </SelectorWrapper>
    </>
  );
};
