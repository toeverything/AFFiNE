import { useDocMetaHelper } from '@affine/core/hooks/use-block-suite-page-meta';
import { useGetDocCollectionPageTitle } from '@affine/core/hooks/use-block-suite-workspace-page-title';
import { useJournalHelper } from '@affine/core/hooks/use-journal';
import { CollectionService } from '@affine/core/modules/collection';
import { WorkspaceSubPath } from '@affine/core/shared';
import type { Collection } from '@affine/env/filter';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import {
  EdgelessIcon,
  PageIcon,
  TodayIcon,
  ViewLayersIcon,
} from '@blocksuite/icons';
import type {
  AffineCommand,
  CommandCategory,
  DocRecord,
  Workspace,
} from '@toeverything/infra';
import {
  AffineCommandRegistry,
  DocsService,
  GlobalContextService,
  PreconditionStrategy,
  useLiveData,
  useService,
  WorkspaceService,
} from '@toeverything/infra';
import { atom, useAtomValue } from 'jotai';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { recentPageIdsBaseAtom } from '../../../atoms';
import { useNavigateHelper } from '../../../hooks/use-navigate-helper';
import { usePageHelper } from '../../blocksuite/block-suite-page-list/utils';
import { filterSortAndGroupCommands } from './filter-commands';
import type { CMDKCommand, CommandContext } from './types';

interface SearchResultsValue {
  space: string;
  content: string;
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
    return context.docMode === 'edgeless';
  }
  if (command.preconditionStrategy === PreconditionStrategy.InPaper) {
    return context.docMode === 'page';
  }
  if (command.preconditionStrategy === PreconditionStrategy.InPaperOrEdgeless) {
    return !!context.docMode;
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

const useRecentDocs = () => {
  const docs = useLiveData(useService(DocsService).docRecordList.records$);
  const recentPageIds = useAtomValue(recentPageIdsBaseAtom);
  return useMemo(() => {
    return recentPageIds
      .map(pageId => {
        const page = docs.find(page => page.id === pageId);
        return page;
      })
      .filter((p): p is DocRecord => !!p);
  }, [recentPageIds, docs]);
};

export const docToCommand = (
  category: CommandCategory,
  doc: DocRecord,
  navigationHelper: ReturnType<typeof useNavigateHelper>,
  getPageTitle: ReturnType<typeof useGetDocCollectionPageTitle>,
  isPageJournal: (pageId: string) => boolean,
  t: ReturnType<typeof useAFFiNEI18N>,
  workspace: Workspace,
  subTitle?: string,
  blockId?: string
): CMDKCommand => {
  const docMode = doc.mode$.value;

  const title = getPageTitle(doc.id) || t['Untitled']();
  const commandLabel = {
    title: title,
    subTitle: subTitle,
  };

  // hack: when comparing, the part between >>> and <<< will be ignored
  // adding this patch so that CMDK will not complain about duplicated commands
  const id = category + '.' + doc.id;

  const icon = isPageJournal(doc.id) ? (
    <TodayIcon />
  ) : docMode === 'edgeless' ? (
    <EdgelessIcon />
  ) : (
    <PageIcon />
  );

  return {
    id,
    label: commandLabel,
    category: category,
    run: () => {
      if (!workspace) {
        console.error('current workspace not found');
        return;
      }
      if (blockId) {
        return navigationHelper.jumpToPageBlock(workspace.id, doc.id, blockId);
      }
      return navigationHelper.jumpToPage(workspace.id, doc.id);
    },
    icon: icon,
    timestamp: doc.meta?.updatedDate,
  };
};

export const usePageCommands = () => {
  const recentDocs = useRecentDocs();
  const docs = useLiveData(useService(DocsService).docRecordList.records$);
  const workspace = useService(WorkspaceService).workspace;
  const pageHelper = usePageHelper(workspace.docCollection);
  const pageMetaHelper = useDocMetaHelper(workspace.docCollection);
  const query = useAtomValue(cmdkQueryAtom);
  const navigationHelper = useNavigateHelper();
  const journalHelper = useJournalHelper(workspace.docCollection);
  const t = useAFFiNEI18N();
  const getPageTitle = useGetDocCollectionPageTitle(workspace.docCollection);
  const { isPageJournal } = useJournalHelper(workspace.docCollection);

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
      results = recentDocs.map(doc => {
        return docToCommand(
          'affine:recent',
          doc,
          navigationHelper,
          getPageTitle,
          isPageJournal,
          t,
          workspace
        );
      });
    } else {
      // queried pages that has matched contents
      // TODO: we shall have a debounce for global search here
      const searchResults = workspace.docCollection.search({
        query,
      }) as unknown as Map<string, SearchResultsValue>;
      const resultValues = Array.from(searchResults.values());

      const reverseMapping: Map<string, string> = new Map();
      searchResults.forEach((value, key) => {
        reverseMapping.set(value.space, key);
      });

      results = docs.map(doc => {
        const category = 'affine:pages';

        const subTitle = resultValues.find(
          result => result.space === doc.id
        )?.content;

        const blockId = reverseMapping.get(doc.id);

        const command = docToCommand(
          category,
          doc,
          navigationHelper,
          getPageTitle,
          isPageJournal,
          t,
          workspace,
          subTitle,
          blockId
        );
        return command;
      });

      // check if the pages have exact match. if not, we should show the "create page" command
      if (results.every(command => command.originalValue !== query)) {
        results.push({
          id: 'affine:pages:append-to-journal',
          label: t['com.affine.journal.cmdk.append-to-today'](),
          alwaysShow: true,
          category: 'affine:creation',
          run: async () => {
            const appendRes = await journalHelper.appendContentToToday(query);
            if (!appendRes) return;
            const { page, blockId } = appendRes;
            navigationHelper.jumpToPageBlock(
              page.collection.id,
              page.id,
              blockId
            );
          },
          icon: <TodayIcon />,
        });

        results.push({
          id: 'affine:pages:create-page',
          label: t['com.affine.cmdk.affine.create-new-page-as']({
            keyWord: query,
          }),
          alwaysShow: true,
          category: 'affine:creation',
          run: async () => {
            const page = pageHelper.createPage();
            page.load();
            pageMetaHelper.setDocTitle(page.id, query);
          },
          icon: <PageIcon />,
        });

        results.push({
          id: 'affine:pages:create-edgeless',
          label: t['com.affine.cmdk.affine.create-new-edgeless-as']({
            keyWord: query,
          }),
          alwaysShow: true,
          category: 'affine:creation',
          run: async () => {
            const page = pageHelper.createEdgeless();
            page.load();
            pageMetaHelper.setDocTitle(page.id, query);
          },
          icon: <EdgelessIcon />,
        });
      }
    }
    return results;
  }, [
    searchTime,
    query,
    recentDocs,
    navigationHelper,
    getPageTitle,
    isPageJournal,
    t,
    workspace,
    docs,
    journalHelper,
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
  const collectionService = useService(CollectionService);
  const collections = useLiveData(collectionService.collections$);
  const query = useAtomValue(cmdkQueryAtom);
  const navigationHelper = useNavigateHelper();
  const t = useAFFiNEI18N();
  const workspace = useService(WorkspaceService).workspace;
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
      results = collections.map(collection => {
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
  }, [query, collections, navigationHelper, selectCollection, t, workspace]);
};

export const useCMDKCommandGroups = () => {
  const pageCommands = usePageCommands();
  const collectionCommands = useCollectionsCommands();

  const currentDocMode =
    useLiveData(useService(GlobalContextService).globalContext.docMode.$) ??
    undefined;
  const affineCommands = useMemo(() => {
    return getAllCommand({
      docMode: currentDocMode,
    });
  }, [currentDocMode]);
  const query = useAtomValue(cmdkQueryAtom).trim();

  return useMemo(() => {
    const commands = [
      ...collectionCommands,
      ...pageCommands,
      ...affineCommands,
    ];
    return filterSortAndGroupCommands(commands, query);
  }, [affineCommands, collectionCommands, pageCommands, query]);
};
