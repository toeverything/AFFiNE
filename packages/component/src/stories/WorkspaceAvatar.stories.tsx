import { WorkspaceFlavour } from '@affine/workspace/type';
import { Workspace } from '@blocksuite/store';
import type { Meta, StoryFn } from '@storybook/react';

import type { WorkspaceAvatarProps } from '../components/workspace-avatar';
import { WorkspaceAvatar } from '../components/workspace-avatar';

export default {
  title: 'AFFiNE/WorkspaceAvatar',
  component: WorkspaceAvatar,
  argTypes: {
    size: {
      control: {
        type: 'range',
        min: 20,
        max: 100,
      },
    },
  },
} satisfies Meta<WorkspaceAvatarProps>;

const basicBlockSuiteWorkspace = new Workspace({
  id: 'blocksuite-local',
  blobOptionsGetter: (_: string) => undefined,
});

basicBlockSuiteWorkspace.meta.setName('Hello World');

export const Basic: StoryFn<WorkspaceAvatarProps> = props => {
  return (
    <WorkspaceAvatar
      {...props}
      workspace={{
        flavour: WorkspaceFlavour.LOCAL,
        id: 'local',
        blockSuiteWorkspace: basicBlockSuiteWorkspace,
        providers: [],
      }}
    />
  );
};

Basic.args = {
  size: 40,
};

const avatarBlockSuiteWorkspace = new Workspace({
  id: 'blocksuite-local',
  blobOptionsGetter: (_: string) => undefined,
});

avatarBlockSuiteWorkspace.meta.setName('Hello World');
avatarBlockSuiteWorkspace.blobs.then(async blobs => {
  if (blobs) {
    const buffer = await (
      await fetch(new URL('@affine-test/fixtures/smile.png', import.meta.url))
    ).arrayBuffer();
    const id = await blobs.set(new Blob([buffer], { type: 'image/png' }));
    avatarBlockSuiteWorkspace.meta.setAvatar(id);
  }
});

export const BlobExample: StoryFn<WorkspaceAvatarProps> = props => {
  return (
    <WorkspaceAvatar
      {...props}
      workspace={{
        flavour: WorkspaceFlavour.LOCAL,
        id: 'local',
        blockSuiteWorkspace: avatarBlockSuiteWorkspace,
        providers: [],
      }}
    />
  );
};

BlobExample.args = {
  size: 40,
};

export const Empty: StoryFn<WorkspaceAvatarProps> = props => {
  return <WorkspaceAvatar {...props} workspace={null} />;
};

Empty.args = {
  size: 40,
};
