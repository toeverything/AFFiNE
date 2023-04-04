import type { AffineWorkspace, LocalWorkspace } from '@affine/workspace/type';
import type { Workspace } from '@blocksuite/store';
import * as RadixAvatar from '@radix-ui/react-avatar';
import { useBlockSuiteWorkspaceAvatarUrl } from '@toeverything/hooks/use-blocksuite-workspace-avatar-url';
import { useBlockSuiteWorkspaceName } from '@toeverything/hooks/use-blocksuite-workspace-name';
import clsx from 'clsx';
import type React from 'react';

import { avatarImageStyle, avatarStyle, avatarTextStyle } from './index.css';

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
  size,
  workspace,
  ...props
}) => {
  const [avatar] = useBlockSuiteWorkspaceAvatarUrl(workspace);
  const [name] = useBlockSuiteWorkspaceName(workspace);

  return (
    <RadixAvatar.Root
      {...props}
      className={clsx(avatarStyle, props.className)}
      style={{
        height: size,
        width: size,
      }}
    >
      <RadixAvatar.Image className={avatarImageStyle} src={avatar} alt={name} />
      <RadixAvatar.Fallback
        className={avatarTextStyle}
        style={{
          backgroundColor: stringToColour(name),
        }}
      >
        {name.substring(0, 1)}
      </RadixAvatar.Fallback>
    </RadixAvatar.Root>
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
  return (
    <RadixAvatar.Root
      {...props}
      className={clsx(avatarStyle, props.className)}
      style={{
        height: size,
        width: size,
      }}
    >
      <RadixAvatar.Fallback
        className={avatarTextStyle}
        style={{
          backgroundColor: stringToColour('A'),
        }}
      >
        A
      </RadixAvatar.Fallback>
    </RadixAvatar.Root>
  );
};
