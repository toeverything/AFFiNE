import { CMDKQuickSearchModal } from '@affine/core/components/pure/cmdk';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { rootWorkspacesMetadataAtom } from '@affine/workspace/atom';
import { getOrCreateWorkspace } from '@affine/workspace/manager';
import type { Meta, StoryFn } from '@storybook/react';
import { currentWorkspaceIdAtom } from '@toeverything/infra/atom';
import {
  registerAffineCreationCommands,
  registerAffineLayoutCommands,
  registerAffineSettingsCommands,
} from 'apps/core/src/commands';
import { useStore } from 'jotai';
import { useEffect, useLayoutEffect } from 'react';
import { withRouter } from 'storybook-addon-react-router-v6';

export default {
  title: 'AFFiNE/QuickSearch',
  parameters: {
    chromatic: { disableSnapshot: true },
  },
} satisfies Meta;

function useRegisterCommands() {
  const t = useAFFiNEI18N();
  const store = useStore();
  useEffect(() => {
    const unsubs = [
      registerAffineSettingsCommands({
        t,
        store,
        theme: {
          setTheme: () => {},
          theme: 'auto',
          themes: ['auto', 'dark', 'light'],
        },
      }),
      registerAffineCreationCommands({
        t,
        store,
        pageHelper: {
          createEdgeless: () => 'noop',
          createPage: () => 'noop',
          importFile: () => Promise.resolve(),
          isPreferredEdgeless: () => false,
        },
      }),
      registerAffineLayoutCommands({ t, store }),
    ];

    return () => {
      unsubs.forEach(unsub => unsub());
    };
  }, [store, t]);
}

function usePrepareWorkspace() {
  const store = useStore();
  useLayoutEffect(() => {
    const workspaceId = 'test-workspace';
    getOrCreateWorkspace(workspaceId, WorkspaceFlavour.LOCAL);
    store.set(rootWorkspacesMetadataAtom, [
      {
        id: workspaceId,
        flavour: WorkspaceFlavour.LOCAL,
        version: 4,
      },
    ]);
    store.set(currentWorkspaceIdAtom, workspaceId);
  }, [store]);
}

export const CMDKStoryWithCommands: StoryFn = () => {
  usePrepareWorkspace();
  useRegisterCommands();

  return <CMDKQuickSearchModal open />;
};

CMDKStoryWithCommands.decorators = [withRouter];
