import type { AffineWorkspace, LocalWorkspace } from '@affine/workspace/type';
import type { Workspace } from '@blocksuite/store';
import { useBlockSuiteWorkspaceAvatarUrl } from '@toeverything/hooks/use-blocksuite-workspace-avatar-url';
import clsx from 'clsx';
import type React from 'react';
import { memo } from 'react';

import { avatarStyle, avatarTextStyle } from './index.css';

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
  className?: string;
}

export const Avatar: React.FC<AvatarProps> = memo<AvatarProps>(function Avatar({
  size: _size,
  avatar_url,
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
          className={clsx(avatarStyle, props.className)}
          style={{
            width: sizeStr,
            height: sizeStr,
          }}
        >
          <picture>
            <img
              width={size}
              height={size}
              src={avatar_url}
              alt=""
              referrerPolicy="no-referrer"
            />
          </picture>
        </div>
      ) : (
        <div
          {...props}
          className={avatarTextStyle}
          style={{
            width: sizeStr,
            height: sizeStr,
            fontSize: Math.ceil(0.5 * size) + 'px',
            background: stringToColour(name || 'AFFiNE'),
          }}
        >
          {(name || 'AFFiNE').substring(0, 1)}
        </div>
      )}
    </>
  );
});

export type WorkspaceAvatarProps = {
  size?: number;
  workspace: LocalWorkspace | AffineWorkspace | null;
  className?: string;
};

export type BlockSuiteWorkspaceAvatar = Omit<
  WorkspaceAvatarProps,
  'workspace'
> & {
  workspace: Workspace;
};

export const BlockSuiteWorkspaceAvatar: React.FC<BlockSuiteWorkspaceAvatar> = ({
  size = 20,
  workspace,
  ...props
}) => {
  const [avatar] = useBlockSuiteWorkspaceAvatarUrl(workspace);

  return (
    <Avatar
      {...props}
      size={size}
      name={workspace.meta.name ?? 'Untitled'}
      avatar_url={avatar ?? ''}
    />
  );
};

export const WorkspaceAvatar: React.FC<WorkspaceAvatarProps> = ({
  size = 20,
  workspace,
  ...props
}) => {
  if (workspace && 'blockSuiteWorkspace' in workspace) {
    return (
      <BlockSuiteWorkspaceAvatar
        {...props}
        size={size}
        workspace={workspace.blockSuiteWorkspace}
      />
    );
  }
  return <Avatar {...props} size={size} name="UNKNOWN" avatar_url="" />;
};
