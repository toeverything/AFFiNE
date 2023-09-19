import { CMDKQuickSearchModal } from '@affine/core/components/pure/cmdk';
import type { Meta, StoryFn } from '@storybook/react';
import { getCurrentStore } from '@toeverything/infra/atom';
import { registerAffineCreationCommands } from 'apps/core/src/commands/affine-creation';
import { registerAffineLayoutCommands } from 'apps/core/src/commands/affine-layout';
import { registerAffineUiCommands } from 'apps/core/src/commands/affine-ui';

export default {
  title: 'AFFiNE/QuickSearch',
  parameters: {
    chromatic: { disableSnapshot: true },
  },
} satisfies Meta;

const store = getCurrentStore();

registerAffineUiCommands({ store });
registerAffineCreationCommands({ store });
registerAffineLayoutCommands({ store });

export const CMDKStoryWithCommands: StoryFn = () => {
  return <CMDKQuickSearchModal open />;
};
