import type { LocalWorkspace } from '@affine/workspace/type';
import { WorkspaceFlavour } from '@affine/workspace/type';
import type { FC } from 'react';

import { Button } from '../..';
import type { ShareMenuProps } from './index';
import { buttonStyle, descriptionStyle, menuItemStyle } from './index.css';

const SharePage: FC<ShareMenuProps> = props => {
  if (props.workspace.flavour === WorkspaceFlavour.LOCAL) {
    return (
      <div className={menuItemStyle}>
        <div className={descriptionStyle}>
          Sharing page publicly requires AFFiNE Cloud service.
        </div>
        <Button
          className={buttonStyle}
          type="light"
          shape="round"
          onClick={() => {
            props.onEnableAffineCloud(props.workspace as LocalWorkspace);
          }}
        >
          Enable AFFiNE Cloud
        </Button>
      </div>
    );
  }
  return (
    <div className={menuItemStyle}>
      <div className={descriptionStyle}>???</div>
      ???
    </div>
  );
};

export default SharePage;
