import React from 'react';

import { RemWorkspace, RemWorkspaceFlavour } from '../../../shared';
import { stringToColour } from '../../../utils';

interface AvatarProps {
  size: number;
  name: string;
  avatar: string;
  style?: React.CSSProperties;
}

export const Avatar: React.FC<AvatarProps> = React.memo<AvatarProps>(
  function Avatar(props) {
    const size = props.size || 20;
    const sizeStr = size + 'px';

    return (
      <>
        {props.avatar ? (
          <div
            style={{
              ...props.style,
              width: sizeStr,
              height: sizeStr,
              color: '#fff',
              borderRadius: '50%',
              overflow: 'hidden',
              display: 'inline-block',
              verticalAlign: 'middle',
            }}
          >
            <picture>
              <img
                style={{ width: sizeStr, height: sizeStr }}
                src={props.avatar}
                alt=""
                referrerPolicy="no-referrer"
              />
            </picture>
          </div>
        ) : (
          <div
            style={{
              ...props.style,
              width: sizeStr,
              height: sizeStr,
              border: '1px solid #fff',
              color: '#fff',
              fontSize: Math.ceil(0.5 * size) + 'px',
              background: stringToColour(props.name || 'AFFiNE'),
              borderRadius: '50%',
              textAlign: 'center',
              lineHeight: size + 'px',
              display: 'inline-block',
              verticalAlign: 'middle',
            }}
          >
            {(props.name || 'AFFiNE').substring(0, 1)}
          </div>
        )}
      </>
    );
  }
);

export type WorkspaceUnitAvatarProps = {
  size?: number;
  workspace: RemWorkspace | null;
  style?: React.CSSProperties;
};

export const WorkspaceAvatar: React.FC<WorkspaceUnitAvatarProps> = ({
  size = 20,
  workspace,
  style,
}) => {
  let avatar = 'UNKNOWN';
  let name = 'UNKNOWN';
  if (workspace?.flavour === RemWorkspaceFlavour.AFFINE) {
    if (workspace.firstBinarySynced) {
      avatar = workspace.blockSuiteWorkspace.meta.avatar;
      name = workspace.blockSuiteWorkspace.meta.name;
    } else {
      avatar = 'loading...';
      name = 'loading...';
    }
  } else if (workspace?.flavour === RemWorkspaceFlavour.LOCAL) {
    avatar = workspace.blockSuiteWorkspace.meta.avatar;
    name = workspace.blockSuiteWorkspace.meta.name;
  }
  return <Avatar size={size} name={name} avatar={avatar} style={style} />;
};
