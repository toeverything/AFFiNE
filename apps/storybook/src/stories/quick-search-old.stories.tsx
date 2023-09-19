import { QuickSearchModal } from '@affine/core/components/pure/quick-search-modal';
import { type LocalWorkspace,WorkspaceFlavour } from '@affine/env/workspace';
import { getOrCreateWorkspace } from '@affine/workspace/manager';
import type { Meta, StoryFn } from '@storybook/react';
import { withRouter } from 'storybook-addon-react-router-v6';

export default {
  title: 'AFFiNE/OldQuickSearchModal',
  component: QuickSearchModal,
  parameters: {
    chromatic: { disableSnapshot: true },
  },
} satisfies Meta;

const blockSuiteWorkspace = getOrCreateWorkspace(
  'blocksuite-local',
  WorkspaceFlavour.LOCAL
);

const localWorkspace: LocalWorkspace = {
  id: 'test-workspace',
  flavour: WorkspaceFlavour.LOCAL,
  blockSuiteWorkspace,
};

export const Basic: StoryFn = () => {
  return <QuickSearchModal open setOpen={() => {}} workspace={localWorkspace} />;
};

Basic.decorators = [withRouter];
