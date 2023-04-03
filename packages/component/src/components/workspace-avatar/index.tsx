import type { AffineWorkspace, LocalWorkspace } from '@affine/workspace/type';
import type { Workspace } from '@blocksuite/store';
import { useBlockSuiteWorkspaceAvatarUrl } from '@toeverything/hooks/use-blocksuite-workspace-avatar-url';
import type React from 'react';
import { memo } from 'react';

function stringToColour(str: string) {
  str = str || 'affine';
  let colour = '#';
  let hash = 0;
  // str to hash
  for (
    let i = 0;
    i < str.length;
    hash = str.charCodeAt(i++) + ((hash << 5) - hash)
  );

  // int/hash to hex
  for (
    let i = 0;
    i < 3;
    colour += ('00' + ((hash >> (i++ * 8)) & 0xff).toString(16)).slice(-2)
  );

  return colour;
}

interface AvatarProps {
  size: number;
  name: string;
  avatar_url: string;
  style?: React.CSSProperties;
}

export const Avatar: React.FC<AvatarProps> = memo<AvatarProps>(function Avatar({
  size: _size,
  avatar_url,
  style,
  name,
  ...props
}) {
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
            display: 'inline-flex',
            lineHeight: '1',
            justifyContent: 'center',
            alignItems: 'center',
            userSelect: 'none',
          }}
        >
          {(name || 'AFFiNE').substring(0, 1)}
        </div>
      )}
    </>
  );
});

export type WorkspaceUnitAvatarProps = {
  size?: number;
  workspace: LocalWorkspace | AffineWorkspace | null;
  style?: React.CSSProperties;
};

export type BlockSuiteWorkspaceAvatar = Omit<
  WorkspaceUnitAvatarProps,
  'workspace'
> & {
  workspace: Workspace;
};

export const BlockSuiteWorkspaceAvatar: React.FC<BlockSuiteWorkspaceAvatar> = ({
  size = 20,
  workspace,
  style,
  ...props
}) => {
  const [avatar] = useBlockSuiteWorkspaceAvatarUrl(workspace);

  return (
    <Avatar
      {...props}
      size={size}
      name={workspace.meta.name ?? 'Untitled'}
      avatar_url={avatar ?? ''}
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
