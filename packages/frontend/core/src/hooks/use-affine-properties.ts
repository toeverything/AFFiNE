import type { PageMeta } from '@blocksuite/store';
import { useAtomValue } from 'jotai';
import { useCallback, useEffect, useReducer } from 'react';

import { usePageHelper } from '../components/blocksuite/block-suite-page-list/utils';
import {
  currentWorkspacePropertiesAdapterAtom,
  waitForCurrentWorkspaceAtom,
} from '../modules/workspace';
import { useBlockSuitePageMeta } from './use-block-suite-page-meta';

export function useWorkspacePropertiesAdapter() {
  const adapter = useAtomValue(currentWorkspacePropertiesAdapterAtom);
  const [, forceUpdate] = useReducer(c => c + 1, 0);

  useEffect(() => {
    // todo: track which properties are used and then filter by property path change
    // using Y.YEvent.path
    function observe() {
      forceUpdate();
    }
    adapter.properties.observeDeep(observe);
    return () => {
      adapter.properties.unobserveDeep(observe);
    };
  }, [adapter]);

  return adapter;
}

export function useJournalHelper() {
  const adapter = useWorkspacePropertiesAdapter();
  const currentWorkspace = useAtomValue(waitForCurrentWorkspaceAtom);
  const pageMetas = useBlockSuitePageMeta(currentWorkspace.blockSuiteWorkspace);
  const pageHelper = usePageHelper(currentWorkspace.blockSuiteWorkspace);

  const getJournalPages = useCallback(() => {
    return pageMetas.reduce((acc, page) => {
      const journalDate = adapter.getJournalPageDate(page.id);
      if (journalDate) {
        const pages = acc.get(journalDate) ?? new Set();
        pages.add(page);
        acc.set(journalDate, pages);
      }
      return acc;
    }, new Map<string, Set<PageMeta>>());
  }, [adapter, pageMetas]);

  const createJournalPage = useCallback(
    (date: string) => {
      const page = pageHelper.createPage();
      adapter.setJournalPageDate(page.id, date);
      return page;
    },
    [adapter, pageHelper]
  );

  const getJournalPageDate = useCallback(
    (pageId: string) => {
      return adapter.getJournalPageDate(pageId);
    },
    [adapter]
  );

  return {
    getJournalPages,
    createJournalPage,
    getJournalPageDate,
  };
}
