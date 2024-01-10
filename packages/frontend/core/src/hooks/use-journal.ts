import { initEmptyPage } from '@toeverything/infra/blocksuite';
import dayjs from 'dayjs';
import { useCallback, useMemo } from 'react';

import type { BlockSuiteWorkspace } from '../shared';
import { timestampToLocalDate } from '../utils';
import { useWorkspacePropertiesAdapter } from './use-affine-adapter';
import { useBlockSuiteWorkspaceHelper } from './use-block-suite-workspace-helper';
import { useNavigateHelper } from './use-navigate-helper';

type MaybeDate = Date | string | number;
export const JOURNAL_DATE_FORMAT = 'YYYY-MM-DD';

function isJournalString(j?: string | false) {
  if (!runtimeConfig.enableJournal) return false;
  return j ? !!j?.match(/^\d{4}-\d{2}-\d{2}$/) : false;
}

function toDayjs(j?: string | false) {
  if (!j || !isJournalString(j)) return null;
  const day = dayjs(j);
  if (!day.isValid()) return null;
  return day;
}

export const useJournalHelper = (workspace: BlockSuiteWorkspace) => {
  const bsWorkspaceHelper = useBlockSuiteWorkspaceHelper(workspace);
  const navigateHelper = useNavigateHelper();

  const adapter = useWorkspacePropertiesAdapter();

  /**
   * @internal
   */
  const _createJournal = useCallback(
    (maybeDate: MaybeDate) => {
      const title = dayjs(maybeDate).format(JOURNAL_DATE_FORMAT);
      const page = bsWorkspaceHelper.createPage();
      initEmptyPage(page, title).catch(err =>
        console.error('Failed to load journal page', err)
      );
      adapter.setJournalPageDateString(page.id, title);
      return page;
    },
    [adapter, bsWorkspaceHelper]
  );

  const isPageJournal = useCallback(
    (pageId: string) => {
      return isJournalString(adapter.getJournalPageDateString(pageId));
    },
    [adapter]
  );

  /**
   * query all journals by date
   */
  const getJournalsByDate = useCallback(
    (maybeDate: MaybeDate) => {
      const day = dayjs(maybeDate);
      return Array.from(workspace.pages.values()).filter(page => {
        const pageId = page.id;
        if (!isPageJournal(pageId)) return false;
        if (page.meta.trash) return false;
        const journalDate = adapter.getJournalPageDateString(page.id);
        if (!journalDate) return false;
        return day.isSame(journalDate, 'day');
      });
    },
    [adapter, isPageJournal, workspace.pages]
  );

  /**
   * get journal by date, create one if not exist
   */
  const getJournalByDate = useCallback(
    (maybeDate: MaybeDate) => {
      const pages = getJournalsByDate(maybeDate);
      if (pages.length) return pages[0];
      return _createJournal(maybeDate);
    },
    [_createJournal, getJournalsByDate]
  );

  /**
   * open journal by date, create one if not exist
   */
  const openJournal = useCallback(
    (maybeDate: MaybeDate) => {
      const page = getJournalByDate(maybeDate);
      navigateHelper.openPage(workspace.id, page.id);
    },
    [getJournalByDate, navigateHelper, workspace.id]
  );

  /**
   * open today's journal
   */
  const openToday = useCallback(() => {
    const date = dayjs().format(JOURNAL_DATE_FORMAT);
    openJournal(date);
  }, [openJournal]);

  const getJournalDateString = useCallback(
    (pageId: string) => {
      return adapter.getJournalPageDateString(pageId);
    },
    [adapter]
  );

  const getLocalizedJournalDateString = useCallback(
    (pageId: string) => {
      const journalDateString = getJournalDateString(pageId);
      if (!journalDateString) return null;
      return timestampToLocalDate(journalDateString);
    },
    [getJournalDateString]
  );

  return useMemo(
    () => ({
      getJournalsByDate,
      getJournalByDate,
      getJournalDateString,
      getLocalizedJournalDateString,
      openJournal,
      openToday,
      isPageJournal,
    }),
    [
      getJournalByDate,
      getJournalDateString,
      getJournalsByDate,
      getLocalizedJournalDateString,
      isPageJournal,
      openJournal,
      openToday,
    ]
  );
};

export const useJournalInfoHelper = (
  workspace: BlockSuiteWorkspace,
  pageId?: string | null
) => {
  const { isPageJournal, getJournalDateString } = useJournalHelper(workspace);
  const journalDate = useMemo(
    () => (pageId ? toDayjs(getJournalDateString(pageId)) : null),
    [getJournalDateString, pageId]
  );

  return useMemo(
    () => ({
      isJournal: pageId ? isPageJournal(pageId) : false,
      journalDate,
    }),
    [isPageJournal, journalDate, pageId]
  );
};
