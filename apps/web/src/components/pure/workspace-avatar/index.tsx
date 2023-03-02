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
  function Avatar({ size: _size, avatar_url, style, name, ...props }) {
    const size = _size || 20;
    const sizeStr = size + 'px';

    return (
      <>
        {avatar_url ? (
          <div
            {...props}
            style={{
              ...style,
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
                src={avatar_url}
                alt=""
                referrerPolicy="no-referrer"
              />
            </picture>
          </div>
        ) : (
          <div
            {...props}
            style={{
              ...style,
              width: sizeStr,
              height: sizeStr,
              border: '1px solid #fff',
              color: '#fff',
              fontSize: Math.ceil(0.5 * size) + 'px',
              background: stringToColour(name || 'AFFiNE'),
              borderRadius: '50%',
              textAlign: 'center',
              lineHeight: size + 'px',
              display: 'inline-block',
              verticalAlign: 'middle',
            }}
          >
            {(name || 'AFFiNE').substring(0, 1)}
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
  ...props
}) => {
  const avatarURL = useWorkspaceBlobImage(workspace.meta.avatar, workspace);
  return (
    <Avatar
      {...props}
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
  return (
    <Avatar {...props} size={size} name="UNKNOWN" avatar_url="" style={style} />
  );
};
