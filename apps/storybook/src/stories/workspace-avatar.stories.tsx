import type { WorkspaceAvatarProps } from '@affine/component/workspace-avatar';
import { WorkspaceAvatar } from '@affine/component/workspace-avatar';
import { __unstableSchemas, AffineSchemas } from '@blocksuite/blocks/models';
import { Schema, Workspace } from '@blocksuite/store';
import type { Meta, StoryFn } from '@storybook/react';

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

const schema = new Schema();

schema.register(AffineSchemas).register(__unstableSchemas);

const basicBlockSuiteWorkspace = new Workspace({
  id: 'blocksuite-local',
  schema,
});

basicBlockSuiteWorkspace.meta.setName('Hello World');

export const Basic: StoryFn<WorkspaceAvatarProps> = props => {
  return <WorkspaceAvatar {...props} workspace={basicBlockSuiteWorkspace} />;
};

Basic.args = {
  size: 40,
};

const avatarBlockSuiteWorkspace = new Workspace({
  id: 'blocksuite-local',
  schema,
});

avatarBlockSuiteWorkspace.meta.setName('Hello World');
fetch(new URL('@affine-test/fixtures/smile.png', import.meta.url))
  .then(res => res.arrayBuffer())
  .then(async buffer => {
    const id = await avatarBlockSuiteWorkspace.blobs.set(
      new Blob([buffer], { type: 'image/png' })
    );
    avatarBlockSuiteWorkspace.meta.setAvatar(id);
  })
  .catch(() => {
    // just ignore
    console.error('Failed to load smile.png');
  });

export const BlobExample: StoryFn<WorkspaceAvatarProps> = props => {
  return <WorkspaceAvatar {...props} workspace={avatarBlockSuiteWorkspace} />;
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
