import { WorkspaceFlavour } from '@affine/workspace/type';
import { Workspace } from '@blocksuite/store';
import type { Meta, StoryFn } from '@storybook/react';

import type { WorkspaceUnitAvatarProps } from '../components/workspace-avatar';
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
} satisfies Meta<WorkspaceUnitAvatarProps>;

const blockSuiteWorkspace = new Workspace({
  id: 'blocksuite-local',
});

blockSuiteWorkspace.meta.setName('Hello World');

export const Basic: StoryFn<WorkspaceUnitAvatarProps> = props => {
  return (
    <div>
      <WorkspaceAvatar
        {...props}
        workspace={{
          flavour: WorkspaceFlavour.LOCAL,
          id: 'local',
          blockSuiteWorkspace,
          providers: [],
        }}
      />
    </div>
  );
};

Basic.args = {
  size: 40,
};
