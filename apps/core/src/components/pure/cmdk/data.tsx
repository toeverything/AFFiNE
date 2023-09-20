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

import { pageSettingsAtom, recentPageIdsBaseAtom } from '../../../atoms';
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
  return true;
}

export const filteredAffineCommands = atom(async get => {
  const context = await get(commandContextAtom);
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
  navigationHelper: ReturnType<typeof useNavigateHelper>
): CMDKCommand => {
  const pageMode = store.get(pageSettingsAtom)?.[page.id]?.mode;
  const currentWorkspaceId = store.get(currentWorkspaceIdAtom);
  return {
    id: page.id,
    label: page.title,
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
  const query = useAtomValue(cmdkQueryAtom);
  const navigationHelper = useNavigateHelper();
  return useMemo(() => {
    let results = recentPages.map(page => {
      return pageToCommand('affine:recent', page, store, navigationHelper);
    });

    if (query.trim() !== '') {
      results = [
        ...results,
        ...pages.map(page => {
          return pageToCommand('affine:pages', page, store, navigationHelper);
        }),
      ];
    }
    return results;
  }, [navigationHelper, pages, query, recentPages, store]);
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
