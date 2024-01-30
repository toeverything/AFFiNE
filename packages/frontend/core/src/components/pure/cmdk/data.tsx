import { useCollectionManager } from '@affine/core/components/page-list';
import {
  useBlockSuitePageMeta,
  usePageMetaHelper,
} from '@affine/core/hooks/use-block-suite-page-meta';
import type { Collection } from '@affine/env/filter';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { EdgelessIcon, PageIcon, ViewLayersIcon } from '@blocksuite/icons';
import type { PageMeta } from '@blocksuite/store';
import { Workspace } from '@toeverything/infra';
import { getCurrentStore } from '@toeverything/infra/atom';
import {
  type AffineCommand,
  AffineCommandRegistry,
  type CommandCategory,
  PreconditionStrategy,
} from '@toeverything/infra/command';
import { useService } from '@toeverything/infra/di';
import { commandScore } from 'cmdk';
import { atom, useAtomValue } from 'jotai';
import { groupBy } from 'lodash-es';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { pageSettingsAtom, recentPageIdsBaseAtom } from '../../../atoms';
import { currentPageIdAtom } from '../../../atoms/mode';
import { useNavigateHelper } from '../../../hooks/use-navigate-helper';
import { CollectionService } from '../../../modules/collection';
import { WorkspaceSubPath } from '../../../shared';
import { usePageHelper } from '../../blocksuite/block-suite-page-list/utils';
import type { CMDKCommand, CommandContext } from './types';

interface SearchResultsValue {
  space: string;
  content: string;
}

export function removeDoubleQuotes(str?: string): string | undefined {
  return str?.replace(/"/g, '');
}

export const cmdkQueryAtom = atom('');
export const cmdkValueAtom = atom('');

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
    return !!context.pageMode;
  }
  if (command.preconditionStrategy === PreconditionStrategy.Never) {
    return false;
  }
  if (typeof command.preconditionStrategy === 'function') {
    return command.preconditionStrategy();
  }
  return true;
}

function getAllCommand(context: CommandContext) {
  const commands = AffineCommandRegistry.getAll();
  return commands.filter(command => {
    return filterCommandByContext(command, context);
  });
}

const useWorkspacePages = () => {
  const workspace = useService(Workspace);
  const pages = useBlockSuitePageMeta(workspace.blockSuiteWorkspace);
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

const valueWrapperStart = '__>>>';
const valueWrapperEnd = '<<<__';

export const pageToCommand = (
  category: CommandCategory,
  page: PageMeta,
  store: ReturnType<typeof getCurrentStore>,
  navigationHelper: ReturnType<typeof useNavigateHelper>,
  t: ReturnType<typeof useAFFiNEI18N>,
  workspace: Workspace,
  label?: {
    title: string;
    subTitle?: string;
  },
  blockId?: string
): CMDKCommand => {
  const pageMode = store.get(pageSettingsAtom)?.[page.id]?.mode;

  const title = page.title || t['Untitled']();
  const commandLabel = label || {
    title: title,
  };

  // hack: when comparing, the part between >>> and <<< will be ignored
  // adding this patch so that CMDK will not complain about duplicated commands
  const id = CSS.escape(
    title +
      (label?.subTitle || '') +
      valueWrapperStart +
      page.id +
      '.' +
      category +
      valueWrapperEnd
  );

  return {
    id,
    label: commandLabel,
    value: id,
    originalValue: title,
    category: category,
    run: () => {
      if (!workspace) {
        console.error('current workspace not found');
        return;
      }
      if (blockId) {
        return navigationHelper.jumpToPageBlock(workspace.id, page.id, blockId);
      }
      return navigationHelper.jumpToPage(workspace.id, page.id);
    },
    icon: pageMode === 'edgeless' ? <EdgelessIcon /> : <PageIcon />,
    timestamp: page.updatedDate,
  };
};

const contentMatchedMagicString = '__$$content_matched$$__';
const contentMatchedWithoutSubtitle =
  '__$$content_matched_without_subtitle$$__';

export const usePageCommands = () => {
  const recentPages = useRecentPages();
  const pages = useWorkspacePages();
  const store = getCurrentStore();
  const workspace = useService(Workspace);
  const pageHelper = usePageHelper(workspace.blockSuiteWorkspace);
  const pageMetaHelper = usePageMetaHelper(workspace.blockSuiteWorkspace);
  const query = useAtomValue(cmdkQueryAtom);
  const navigationHelper = useNavigateHelper();
  const t = useAFFiNEI18N();

  const [searchTime, setSearchTime] = useState<number>(0);

  // HACK: blocksuite indexer is async,
  // so we need to re-search after it has been updated
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    const dosearch = () => {
      setSearchTime(Date.now());
      timer = setTimeout(dosearch, 500);
    };
    timer = setTimeout(dosearch, 500);
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, []);

  return useMemo(() => {
    searchTime; // hack to make the searchTime as a dependency

    let results: CMDKCommand[] = [];
    if (query.trim() === '') {
      results = recentPages.map(page => {
        return pageToCommand(
          'affine:recent',
          page,
          store,
          navigationHelper,
          t,
          workspace
        );
      });
    } else {
      // queried pages that has matched contents
      // TODO: we shall have a debounce for global search here
      const searchResults = workspace.blockSuiteWorkspace.search({
        query,
      }) as unknown as Map<string, SearchResultsValue>;
      const resultValues = Array.from(searchResults.values());

      const pageIds = resultValues.map(result => {
        if (result.space.startsWith('space:')) {
          return result.space.slice(6);
        } else {
          return result.space;
        }
      });
      const reverseMapping: Map<string, string> = new Map();
      searchResults.forEach((value, key) => {
        reverseMapping.set(value.space, key);
      });

      results = pages.map(page => {
        const pageMode = store.get(pageSettingsAtom)?.[page.id]?.mode;
        const category =
          pageMode === 'edgeless' ? 'affine:edgeless' : 'affine:pages';

        const subTitle = resultValues.find(result => result.space === page.id)
          ?.content;
        const label = {
          title: page.title || t['Untitled'](), // Used to ensure that a title exists
          subTitle: subTitle || '',
        };

        const blockId = reverseMapping.get(page.id);

        const command = pageToCommand(
          category,
          page,
          store,
          navigationHelper,
          t,
          workspace,
          label,
          blockId
        );

        if (pageIds.includes(page.id)) {
          // hack to make the page always showing in the search result
          command.value += contentMatchedMagicString;
        }
        if (!subTitle) {
          // hack to make the page title result always before the content result
          command.value += contentMatchedWithoutSubtitle;
        }

        return command;
      });

      // check if the pages have exact match. if not, we should show the "create page" command
      if (results.every(command => command.originalValue !== query)) {
        results.push({
          id: 'affine:pages:create-page',
          label: t['com.affine.cmdk.affine.create-new-page-as']({
            keyWord: query,
          }),
          value: 'affine::create-page' + query, // hack to make the page always showing in the search result
          category: 'affine:creation',
          run: async () => {
            const page = pageHelper.createPage();
            await page.waitForLoaded();
            pageMetaHelper.setPageTitle(page.id, query);
          },
          icon: <PageIcon />,
        });

        results.push({
          id: 'affine:pages:create-edgeless',
          label: t['com.affine.cmdk.affine.create-new-edgeless-as']({
            keyWord: query,
          }),
          value: 'affine::create-edgeless' + query, // hack to make the page always showing in the search result
          category: 'affine:creation',
          run: async () => {
            const page = pageHelper.createEdgeless();
            await page.waitForLoaded();
            pageMetaHelper.setPageTitle(page.id, query);
          },
          icon: <EdgelessIcon />,
        });
      }
    }
    return results;
  }, [
    searchTime,
    query,
    recentPages,
    store,
    navigationHelper,
    t,
    workspace,
    pages,
    pageHelper,
    pageMetaHelper,
  ]);
};

export const collectionToCommand = (
  collection: Collection,
  navigationHelper: ReturnType<typeof useNavigateHelper>,
  selectCollection: (id: string) => void,
  t: ReturnType<typeof useAFFiNEI18N>,
  workspace: Workspace
): CMDKCommand => {
  const label = collection.name || t['Untitled']();
  const category = 'affine:collections';
  return {
    id: collection.id,
    label: label,
    // hack: when comparing, the part between >>> and <<< will be ignored
    // adding this patch so that CMDK will not complain about duplicated commands
    value:
      label +
      valueWrapperStart +
      collection.id +
      '.' +
      category +
      valueWrapperEnd,
    originalValue: label,
    category: category,
    run: () => {
      navigationHelper.jumpToSubPath(workspace.id, WorkspaceSubPath.ALL);
      selectCollection(collection.id);
    },
    icon: <ViewLayersIcon />,
  };
};

export const useCollectionsCommands = () => {
  // todo: considering collections for searching pages
  const { savedCollections } = useCollectionManager(
    useService(CollectionService)
  );
  const query = useAtomValue(cmdkQueryAtom);
  const navigationHelper = useNavigateHelper();
  const t = useAFFiNEI18N();
  const workspace = useService(Workspace);
  const selectCollection = useCallback(
    (id: string) => {
      navigationHelper.jumpToCollection(workspace.id, id);
    },
    [navigationHelper, workspace.id]
  );
  return useMemo(() => {
    let results: CMDKCommand[] = [];
    if (query.trim() === '') {
      return results;
    } else {
      results = savedCollections.map(collection => {
        const command = collectionToCommand(
          collection,
          navigationHelper,
          selectCollection,
          t,
          workspace
        );
        return command;
      });
      return results;
    }
  }, [
    query,
    savedCollections,
    navigationHelper,
    selectCollection,
    t,
    workspace,
  ]);
};

export const useCMDKCommandGroups = () => {
  const pageCommands = usePageCommands();
  const collectionCommands = useCollectionsCommands();

  const currentPageId = useAtomValue(currentPageIdAtom);
  const pageSettings = useAtomValue(pageSettingsAtom);
  const currentPageMode = currentPageId
    ? pageSettings[currentPageId]?.mode
    : undefined;
  const affineCommands = useMemo(() => {
    return getAllCommand({
      pageMode: currentPageMode,
    });
  }, [currentPageMode]);

  return useMemo(() => {
    const commands = [
      ...collectionCommands,
      ...pageCommands,
      ...affineCommands,
    ];
    const groups = groupBy(commands, command => command.category);
    return Object.entries(groups) as [CommandCategory, CMDKCommand[]][];
  }, [affineCommands, collectionCommands, pageCommands]);
};

export const customCommandFilter = (value: string, search: string) => {
  // strip off the part between __>>> and <<<__
  let label = value.replace(
    new RegExp(valueWrapperStart + '.*' + valueWrapperEnd, 'g'),
    ''
  );

  const pageContentMatched = label.includes(contentMatchedMagicString);
  if (pageContentMatched) {
    label = label.replace(contentMatchedMagicString, '');
  }
  const pageTitleMatched = label.includes(contentMatchedWithoutSubtitle);
  if (pageTitleMatched) {
    label = label.replace(contentMatchedWithoutSubtitle, '');
  }

  // use to remove double quotes from a string until this issue is fixed
  // https://github.com/pacocoursey/cmdk/issues/189
  const escapedSearch = removeDoubleQuotes(search) || '';
  const originalScore = commandScore(label, escapedSearch);

  // hack to make the page title result always before the content result
  // if the command has matched the title but not the subtitle,
  // we should give it a higher score
  if (originalScore > 0 && pageTitleMatched) {
    return 0.999;
  }
  // if the command has matched the content but not the label,
  // we should give it a higher score, but not too high
  if (originalScore < 0.01 && pageContentMatched) {
    return 0.3;
  }

  return originalScore;
};

export const useCommandFilteredStatus = (
  groups: [CommandCategory, CMDKCommand[]][]
) => {
  // for each of the groups, show the count of commands that has matched the query
  const query = useAtomValue(cmdkQueryAtom);
  return useMemo(() => {
    return Object.fromEntries(
      groups.map(([category, commands]) => {
        return [category, getCommandFilteredCount(commands, query)] as const;
      })
    ) as Record<CommandCategory, number>;
  }, [groups, query]);
};

function getCommandFilteredCount(commands: CMDKCommand[], query: string) {
  return commands.filter(command => {
    return command.value && customCommandFilter(command.value, query) > 0;
  }).length;
}
