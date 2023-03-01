import React from 'react';

import { useWorkspaceBlobImage } from '../../../hooks/use-workspace-blob';
import { BlockSuiteWorkspace, RemWorkspace } from '../../../shared';
import { stringToColour } from '../../../utils';

interface AvatarProps {
  size: number;
  name: string;
  avatar_url: string;
  style?: React.CSSProperties;
}

export const Avatar: React.FC<AvatarProps> = React.memo<AvatarProps>(
  function Avatar(props) {
    const size = props.size || 20;
    const sizeStr = size + 'px';

    return (
      <>
        {props.avatar_url ? (
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
                src={props.avatar_url}
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

export type BlockSuiteWorkspaceAvatar = Omit<
  WorkspaceUnitAvatarProps,
  'workspace'
> & {
  workspace: BlockSuiteWorkspace;
};

export const BlockSuiteWorkspaceAvatar: React.FC<BlockSuiteWorkspaceAvatar> = ({
  size = 20,
  workspace,
  style,
}) => {
  const avatarURL = useWorkspaceBlobImage(workspace.meta.avatar, workspace);
  return (
    <Avatar
      size={size}
      name={workspace.meta.name}
      avatar_url={avatarURL ?? ''}
      style={style}
    />
  );
};

export const WorkspaceAvatar: React.FC<WorkspaceUnitAvatarProps> = ({
  size = 20,
  workspace,
  style,
  ...props
}) => {
  if (workspace && 'blockSuiteWorkspace' in workspace) {
    return (
      <BlockSuiteWorkspaceAvatar
        {...props}
        size={size}
        workspace={workspace.blockSuiteWorkspace}
        style={style}
      />
    );
  }
  return <Avatar size={size} name="UNKNOWN" avatar_url="" style={style} />;
};
