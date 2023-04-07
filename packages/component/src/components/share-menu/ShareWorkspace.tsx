import type { AffineWorkspace, LocalWorkspace } from '@affine/workspace/type';
import { WorkspaceFlavour } from '@affine/workspace/type';
import type { FC } from 'react';

import { Button } from '../..';
import type { ShareMenuProps } from '.';
import { buttonStyle, descriptionStyle, menuItemStyle } from './index.css';

export const ShareWorkspace: FC<ShareMenuProps> = props => {
  const isAffineWorkspace = props.workspace.flavour === WorkspaceFlavour.AFFINE;
  if (!isAffineWorkspace) {
    return (
      <div className={menuItemStyle}>
        <div className={descriptionStyle}>
          Sharing page publicly requires AFFiNE Cloud service.
        </div>
        <Button
          data-testid="share-menu-enable-affine-cloud-button"
          className={buttonStyle}
          type="light"
          shape="circle"
          onClick={() => {
            props.onEnableAffineCloud(props.workspace as LocalWorkspace);
          }}
        >
          Enable AFFiNE Cloud
        </Button>
      </div>
    );
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
