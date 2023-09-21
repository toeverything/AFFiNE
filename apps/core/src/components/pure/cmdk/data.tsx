import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { EdgelessIcon, PageIcon } from '@blocksuite/icons';
import type { Page, PageMeta } from '@blocksuite/store';
import { useBlockSuitePageMeta } from '@toeverything/hooks/use-block-suite-page-meta';
import {
  getWorkspace,
  waitForWorkspace,
} from '@toeverything/infra/__internal__/workspace';
import {
  currentPageIdAtom,
  currentWorkspaceIdAtom,
  getCurrentStore,
} from '@toeverything/infra/atom';
import {
  type AffineCommand,
  AffineCommandRegistry,
  type CommandCategory,
  PreconditionStrategy,
} from '@toeverything/infra/command';
import { atom, useAtomValue } from 'jotai';
import groupBy from 'lodash/groupBy';
import { useMemo } from 'react';

import {
  openQuickSearchModalAtom,
  pageSettingsAtom,
  recentPageIdsBaseAtom,
} from '../../../atoms';
import { useCurrentWorkspace } from '../../../hooks/current/use-current-workspace';
import { useNavigateHelper } from '../../../hooks/use-navigate-helper';
import type { CMDKCommand, CommandContext } from './types';

export const cmdkQueryAtom = atom('');

// like currentWorkspaceAtom, but not throw error
const safeCurrentPageAtom = atom<Promise<Page | undefined>>(async get => {
  const currentWorkspaceId = get(currentWorkspaceIdAtom);
  if (!currentWorkspaceId) {
    return;
  }

  const currentPageId = get(currentPageIdAtom);

  if (!currentPageId) {
    return;
  }

  const workspace = getWorkspace(currentWorkspaceId);
  await waitForWorkspace(workspace);
  const page = workspace.getPage(currentPageId);

  if (!page) {
    return;
  }

  if (!page.loaded) {
    await page.waitForLoaded();
  }
  return page;
});

export const commandContextAtom = atom<Promise<CommandContext>>(async get => {
  const currentPage = await get(safeCurrentPageAtom);
  const pageSettings = get(pageSettingsAtom);

  return {
    currentPage,
    pageMode: currentPage ? pageSettings[currentPage.id]?.mode : undefined,
  };
});

function filterCommandByContext(
  command: AffineCommand,
  context: CommandContext
) {
  if (command.preconditionStrategy === PreconditionStrategy.Always) {
    return true;
  }
  if (command.preconditionStrategy === PreconditionStrategy.InEdgeless) {
    return context.pageMode === 'edgeless';
  }
  if (command.preconditionStrategy === PreconditionStrategy.InPaper) {
    return context.pageMode === 'page';
  }
  if (command.preconditionStrategy === PreconditionStrategy.InPaperOrEdgeless) {
    return !!context.currentPage;
  }
  if (command.preconditionStrategy === PreconditionStrategy.Never) {
    return false;
  }
  if (typeof command.preconditionStrategy === 'function') {
    return command.preconditionStrategy();
  }
  return true;
}

let quickSearchOpenCounter = 0;
const openCountAtom = atom(get => {
  if (get(openQuickSearchModalAtom)) {
    quickSearchOpenCounter++;
  }
  return quickSearchOpenCounter;
});

export const filteredAffineCommands = atom(async get => {
  const context = await get(commandContextAtom);
  // reset when modal open
  get(openCountAtom);
  const commands = AffineCommandRegistry.getAll();
  return commands.filter(command => {
    return filterCommandByContext(command, context);
  });
});

const useWorkspacePages = () => {
  const [currentWorkspace] = useCurrentWorkspace();
  const pages = useBlockSuitePageMeta(currentWorkspace.blockSuiteWorkspace);
  return pages;
};

const useRecentPages = () => {
  const pages = useWorkspacePages();
  const recentPageIds = useAtomValue(recentPageIdsBaseAtom);
  return useMemo(() => {
    return recentPageIds
      .map(pageId => {
        const page = pages.find(page => page.id === pageId);
        return page;
      })
      .filter((p): p is PageMeta => !!p);
  }, [recentPageIds, pages]);
};

export const pageToCommand = (
  category: CommandCategory,
  page: PageMeta,
  store: ReturnType<typeof getCurrentStore>,
  navigationHelper: ReturnType<typeof useNavigateHelper>,
  t: ReturnType<typeof useAFFiNEI18N>
): CMDKCommand => {
  const pageMode = store.get(pageSettingsAtom)?.[page.id]?.mode;
  const currentWorkspaceId = store.get(currentWorkspaceIdAtom);
  return {
    id: page.id,
    label: page.title || t['Untitled'](),
    // hack: when comparing, the part between >>> and <<< will be ignored
    // adding this patch so that CMDK will not complain about duplicated commands
    value: page.title + '__>>>' + page.id + '.' + category + '<<<__',
    category: category,
    run: () => {
      if (!currentWorkspaceId) {
        console.error('current workspace not found');
        return;
      }
      navigationHelper.jumpToPage(currentWorkspaceId, page.id);
    },
    icon: pageMode === 'edgeless' ? <EdgelessIcon /> : <PageIcon />,
    timestamp: page.updatedDate,
  };
};

export const usePageCommands = () => {
  // todo: considering collections for searching pages
  // const { savedCollections } = useCollectionManager(currentCollectionsAtom);
  const recentPages = useRecentPages();
  const pages = useWorkspacePages();
  const store = getCurrentStore();
  const [workspace] = useCurrentWorkspace();
  const query = useAtomValue(cmdkQueryAtom);
  const navigationHelper = useNavigateHelper();
  const t = useAFFiNEI18N();
  return useMemo(() => {
    let results = recentPages.map(page => {
      return pageToCommand('affine:recent', page, store, navigationHelper, t);
    });

    if (query.trim() !== '') {
      // queried pages that has matched contents
      const pageIds = Array.from(
        workspace.blockSuiteWorkspace.search({ query }).values()
      ).map(id => {
        if (id.startsWith('space:')) {
          return id.slice(6);
        } else {
          return id;
        }
      });

      results = [
        ...results,
        ...pages.map(page => {
          const command = pageToCommand(
            'affine:pages',
            page,
            store,
            navigationHelper,
            t
          );

          if (pageIds.includes(page.id)) {
            // hack to make the page always showing in the search result
            command.value += query;
          }

          return command;
        }),
      ];
    }
    return results;
  }, [
    navigationHelper,
    pages,
    query,
    recentPages,
    store,
    t,
    workspace.blockSuiteWorkspace,
  ]);
};

export const useCMDKCommandGroups = () => {
  const pageCommands = usePageCommands();
  const affineCommands = useAtomValue(filteredAffineCommands);

  return useMemo(() => {
    const commands = [...pageCommands, ...affineCommands];
    const groups = groupBy(commands, command => command.category);
    return Object.entries(groups) as [CommandCategory, CMDKCommand[]][];
  }, [affineCommands, pageCommands]);
};
