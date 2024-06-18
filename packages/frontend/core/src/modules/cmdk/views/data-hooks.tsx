import {
  type AffineCommand,
  AffineCommandRegistry,
  type CommandCategory,
  PreconditionStrategy,
} from '@affine/core/commands';
import { useDocMetaHelper } from '@affine/core/hooks/use-block-suite-page-meta';
import { useGetDocCollectionPageTitle } from '@affine/core/hooks/use-block-suite-workspace-page-title';
import { useJournalHelper } from '@affine/core/hooks/use-journal';
import {
  QuickSearchService,
  RecentPagesService,
  type SearchCallbackResult,
} from '@affine/core/modules/cmdk';
import { CollectionService } from '@affine/core/modules/collection';
import { WorkspaceSubPath } from '@affine/core/shared';
import { mixpanel } from '@affine/core/utils';
import type { Collection } from '@affine/env/filter';
import { Trans } from '@affine/i18n';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import {
  EdgelessIcon,
  LinkIcon,
  PageIcon,
  TodayIcon,
  ViewLayersIcon,
} from '@blocksuite/icons/rc';
import type { DocRecord, Workspace } from '@toeverything/infra';
import {
  GlobalContextService,
  useLiveData,
  useService,
  WorkspaceService,
} from '@toeverything/infra';
import { atom } from 'jotai';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { usePageHelper } from '../../../components/blocksuite/block-suite-page-list/utils';
import { useNavigateHelper } from '../../../hooks/use-navigate-helper';
import { filterSortAndGroupCommands } from './filter-commands';
import * as hlStyles from './highlight.css';
import type { CMDKCommand, CommandContext } from './types';

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

const docToCommand = (
  category: CommandCategory,
  doc: DocRecord,
  run: () => void,
  getPageTitle: ReturnType<typeof useGetDocCollectionPageTitle>,
  isPageJournal: (pageId: string) => boolean,
  t: ReturnType<typeof useAFFiNEI18N>,
  subTitle?: string
): CMDKCommand => {
  const docMode = doc.mode$.value;

  const title = getPageTitle(doc.id) || t['Untitled']();
  const commandLabel = {
    title: title,
    subTitle: subTitle,
  };

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
    originalValue: title,
    run: run,
    icon: icon,
    timestamp: doc.meta?.updatedDate,
  };
};

function useSearchedDocCommands(
  onSelect: (opts: { docId: string; blockId?: string }) => void
) {
  const quickSearch = useService(QuickSearchService).quickSearch;
  const recentPages = useService(RecentPagesService);
  const query = useLiveData(quickSearch.query$);
  const workspace = useService(WorkspaceService).workspace;
  const getPageTitle = useGetDocCollectionPageTitle(workspace.docCollection);
  const { isPageJournal } = useJournalHelper(workspace.docCollection);
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

    if (query.trim().length === 0) {
      return recentPages.getRecentDocs().map(doc => {
        return docToCommand(
          'affine:recent',
          doc,
          () => onSelect({ docId: doc.id }),
          getPageTitle,
          isPageJournal,
          t
        );
      });
    } else {
      return quickSearch
        .getSearchedDocs(query)
        .map(({ blockId, content, doc, source }) => {
          const category = 'affine:pages';

          const command = docToCommand(
            category,
            doc,
            () =>
              onSelect({
                docId: doc.id,
                blockId,
              }),
            getPageTitle,
            isPageJournal,
            t,
            content
          );

          if (source === 'link-ref') {
            command.alwaysShow = true;
            command.originalValue = query;
          }

          return command;
        });
    }
  }, [
    searchTime,
    query,
    recentPages,
    getPageTitle,
    isPageJournal,
    t,
    onSelect,
    quickSearch,
  ]);
}

export const usePageCommands = () => {
  const quickSearch = useService(QuickSearchService).quickSearch;
  const workspace = useService(WorkspaceService).workspace;
  const pageHelper = usePageHelper(workspace.docCollection);
  const pageMetaHelper = useDocMetaHelper(workspace.docCollection);
  const query = useLiveData(quickSearch.query$);
  const navigationHelper = useNavigateHelper();
  const journalHelper = useJournalHelper(workspace.docCollection);
  const t = useAFFiNEI18N();

  const onSelectPage = useCallback(
    (opts: { docId: string; blockId?: string }) => {
      if (!workspace) {
        console.error('current workspace not found');
        return;
      }

      if (opts.blockId) {
        navigationHelper.jumpToPageBlock(
          workspace.id,
          opts.docId,
          opts.blockId
        );
      } else {
        navigationHelper.jumpToPage(workspace.id, opts.docId);
      }
    },
    [navigationHelper, workspace]
  );

  const searchedDocsCommands = useSearchedDocCommands(onSelectPage);

  return useMemo(() => {
    const results: CMDKCommand[] = [...searchedDocsCommands];

    // check if the pages have exact match. if not, we should show the "create page" command
    if (
      results.every(command => command.originalValue !== query) &&
      query.trim()
    ) {
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
          mixpanel.track('AppendToJournal', {
            control: 'cmdk',
          });
        },
        icon: <TodayIcon />,
      });

      results.push({
        id: 'affine:pages:create-page',
        label: (
          <Trans
            i18nKey="com.affine.cmdk.affine.create-new-page-as"
            values={{
              keyWord: query,
            }}
            components={{
              1: <span className={hlStyles.highlightKeyword} />,
            }}
          />
        ),
        alwaysShow: true,
        category: 'affine:creation',
        run: async () => {
          const page = pageHelper.createPage();
          page.load();
          pageMetaHelper.setDocTitle(page.id, query);
          mixpanel.track('DocCreated', {
            control: 'cmdk',
            type: 'doc',
          });
        },
        icon: <PageIcon />,
      });

      results.push({
        id: 'affine:pages:create-edgeless',
        label: (
          <Trans
            i18nKey="com.affine.cmdk.affine.create-new-edgeless-as"
            values={{
              keyWord: query,
            }}
            components={{
              1: <span className={hlStyles.highlightKeyword} />,
            }}
          />
        ),
        alwaysShow: true,
        category: 'affine:creation',
        run: async () => {
          const page = pageHelper.createEdgeless();
          page.load();
          pageMetaHelper.setDocTitle(page.id, query);
          mixpanel.track('DocCreated', {
            control: 'cmdk',
            type: 'whiteboard',
          });
        },
        icon: <EdgelessIcon />,
      });
    }
    return results;
  }, [
    searchedDocsCommands,
    t,
    query,
    journalHelper,
    navigationHelper,
    pageHelper,
    pageMetaHelper,
  ]);
};

// todo: refactor to reduce duplication with usePageCommands
export const useSearchCallbackCommands = () => {
  const quickSearch = useService(QuickSearchService).quickSearch;
  const workspace = useService(WorkspaceService).workspace;
  const pageHelper = usePageHelper(workspace.docCollection);
  const pageMetaHelper = useDocMetaHelper(workspace.docCollection);
  const query = useLiveData(quickSearch.query$);

  const onSelectPage = useCallback(
    (searchResult: SearchCallbackResult) => {
      if (!workspace) {
        console.error('current workspace not found');
        return;
      }
      quickSearch.setSearchCallbackResult(searchResult);
    },
    [quickSearch, workspace]
  );

  const searchedDocsCommands = useSearchedDocCommands(onSelectPage);

  return useMemo(() => {
    const results: CMDKCommand[] = [...searchedDocsCommands];

    // check if the pages have exact match. if not, we should show the "create page" command
    if (
      results.every(command => command.originalValue !== query) &&
      query.trim()
    ) {
      if (query.startsWith('http://') || query.startsWith('https://')) {
        results.push({
          id: 'affine:pages:create-page',
          label: <Trans i18nKey="com.affine.cmdk.affine.insert-link" />,
          alwaysShow: true,
          category: 'affine:creation',
          run: async () => {
            onSelectPage({
              query,
              action: 'insert',
            });
          },
          icon: <LinkIcon />,
        });
      } else {
        results.push({
          id: 'affine:pages:create-page',
          label: (
            <Trans
              i18nKey="com.affine.cmdk.affine.create-new-doc-and-insert"
              values={{
                keyWord: query,
              }}
              components={{
                1: <span className={hlStyles.highlightKeyword} />,
              }}
            />
          ),
          alwaysShow: true,
          category: 'affine:creation',
          run: async () => {
            const page = pageHelper.createPage('page', false);
            page.load();
            pageMetaHelper.setDocTitle(page.id, query);
            onSelectPage({ docId: page.id, isNewDoc: true });
          },
          icon: <PageIcon />,
        });
      }
    }
    return results;
  }, [searchedDocsCommands, query, pageHelper, pageMetaHelper, onSelectPage]);
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
  const quickSearch = useService(QuickSearchService).quickSearch;
  const query = useLiveData(quickSearch.query$);
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
  const quickSearch = useService(QuickSearchService).quickSearch;
  const query = useLiveData(quickSearch.query$).trim();

  return useMemo(() => {
    const commands = [
      ...collectionCommands,
      ...pageCommands,
      ...affineCommands,
    ];
    return filterSortAndGroupCommands(commands, query);
  }, [affineCommands, collectionCommands, pageCommands, query]);
};

export const useSearchCallbackCommandGroups = () => {
  const searchCallbackCommands = useSearchCallbackCommands();

  const quickSearch = useService(QuickSearchService).quickSearch;
  const query = useLiveData(quickSearch.query$).trim();

  return useMemo(() => {
    const commands = [...searchCallbackCommands];
    return filterSortAndGroupCommands(commands, query);
  }, [searchCallbackCommands, query]);
};
