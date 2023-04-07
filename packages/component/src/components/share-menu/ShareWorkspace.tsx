import type { AffineWorkspace } from '@affine/workspace/type';
import { WorkspaceFlavour } from '@affine/workspace/type';
import type { FC } from 'react';

import { Button } from '../..';
import type { ShareMenuProps } from '.';

export const ShareWorkspace: FC<ShareMenuProps> = props => {
  const isAffineWorkspace = props.workspace.flavour === WorkspaceFlavour.AFFINE;
  if (!isAffineWorkspace) {
    return null;
  }
  const isPublicWorkspace = (props.workspace as AffineWorkspace).public;
  return (
    <div>
      {isPublicWorkspace ? (
        <div>
          Current workspace has been published to the web as a public workspace.
        </div>
      ) : (
        <div>Invite others to join the Workspace or publish it to web</div>
      )}

      <Button
        data-testid="share-menu-publish-to-web-button"
        onClick={() => {
          props.onOpenWorkspaceSettings(props.workspace);
        }}
        type="light"
        shape="circle"
      >
        Open Workspace Settings
      </Button>
    </div>
  );
};
