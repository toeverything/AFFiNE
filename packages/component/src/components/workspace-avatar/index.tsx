import type { Workspace } from '@blocksuite/store';
import * as RadixAvatar from '@radix-ui/react-avatar';
import { useBlockSuiteWorkspaceAvatarUrl } from '@toeverything/hooks/use-block-suite-workspace-avatar-url';
import { useBlockSuiteWorkspaceName } from '@toeverything/hooks/use-block-suite-workspace-name';
import clsx from 'clsx';
import type React from 'react';

import { DefaultAvatar } from './default-avatar';
import { avatarImageStyle, avatarStyle } from './index.css';

export type WorkspaceAvatarProps = {
  size?: number;
  workspace: Workspace | null;
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
      <RadixAvatar.Fallback>
        <DefaultAvatar name={name}></DefaultAvatar>
      </RadixAvatar.Fallback>
    </RadixAvatar.Root>
  );
};

export const WorkspaceAvatar: React.FC<WorkspaceAvatarProps> = ({
  size = 20,
  workspace,
  ...props
}) => {
  if (workspace) {
    return (
      <BlockSuiteWorkspaceAvatar {...props} size={size} workspace={workspace} />
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
      <RadixAvatar.Fallback>
        <DefaultAvatar name="A"></DefaultAvatar>
      </RadixAvatar.Fallback>
    </RadixAvatar.Root>
  );
};
