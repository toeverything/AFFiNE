import {
  registerAffineCreationCommands,
  registerAffineLayoutCommands,
  registerAffineSettingsCommands,
} from '@affine/core/commands';
import { CMDKQuickSearchModal } from '@affine/core/components/pure/cmdk';
import { HighlightLabel } from '@affine/core/components/pure/cmdk/highlight';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { rootWorkspacesMetadataAtom } from '@affine/workspace/atom';
import { getOrCreateWorkspace } from '@affine/workspace/manager';
import type { Page } from '@blocksuite/store';
import type { Meta, StoryFn } from '@storybook/react';
import { currentWorkspaceIdAtom } from '@toeverything/infra/atom';
import { useStore } from 'jotai';
import { useEffect, useLayoutEffect, useState } from 'react';
import { withRouter } from 'storybook-addon-react-router-v6';

export default {
  title: 'AFFiNE/QuickSearch',
  parameters: {
    chromatic: { disableSnapshot: true },
  },
} satisfies Meta;

const createMockedPage = () => {
  return {
    id: 'test-page',
    waitForLoaded: () => Promise.resolve(),
  } as any as Page;
};

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
        languageHelper: {
          onLanguageChange: () => {},
          languagesList: [
            { tag: 'en', name: 'English', originalName: 'English' },
            {
              tag: 'zh-Hans',
              name: 'Simplified Chinese',
              originalName: '简体中文',
            },
          ],
          currentLanguage: undefined,
        },
      }),
      registerAffineCreationCommands({
        t,
        store,
        pageHelper: {
          createEdgeless: createMockedPage,
          createPage: createMockedPage,
          importFile: () => Promise.resolve(),
          isPreferredEdgeless: () => false,
        },
      }),
      registerAffineLayoutCommands({
        t,
        store,
      }),
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

export const HighlightStory: StoryFn = () => {
  const [query, setQuery] = useState('');
  const label = {
    title: 'title',
  };
  return (
    <>
      <input value={query} onChange={e => setQuery(e.target.value)} />
      <HighlightLabel label={label} highlight={query} />
    </>
  );
};
