import type { PageMeta } from '@blocksuite/store';
import { initEmptyPage } from '@toeverything/infra/blocksuite';
import dayjs from 'dayjs';
import { useCallback, useMemo } from 'react';

import type { BlockSuiteWorkspace } from '../shared';
import { useBlockSuiteWorkspaceHelper } from './use-block-suite-workspace-helper';
import { useNavigateHelper } from './use-navigate-helper';

type MaybeDate = Date | string | number;
export const JOURNAL_DATE_FORMAT = 'YYYY-MM-DD';

function isPageJournal(pageMeta?: PageMeta) {
  if (!runtimeConfig.enableJournal) return false;
  return !!(pageMeta && pageMeta.title.match(/^\d{4}-\d{2}-\d{2}$/));
}

function getJournalDate(pageMeta?: PageMeta) {
  if (!isPageJournal(pageMeta)) return null;
  if (!pageMeta?.title) return null;
  if (!dayjs(pageMeta.title).isValid()) return null;
  return dayjs(pageMeta.title);
}

export const useJournalHelper = (workspace: BlockSuiteWorkspace) => {
  const bsWorkspaceHelper = useBlockSuiteWorkspaceHelper(workspace);
  const navigateHelper = useNavigateHelper();

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
      return page;
    },
    [bsWorkspaceHelper]
  );

  /**
   * query all journals by date
   */
  const getJournalsByDate = useCallback(
    (maybeDate: MaybeDate) => {
      const day = dayjs(maybeDate);
      return Array.from(workspace.pages.values()).filter(page => {
        if (!isPageJournal(page.meta)) return false;
        if (page.meta.trash) return false;
        const journalDate = getJournalDate(page.meta);
        if (!journalDate) return false;
        return day.isSame(journalDate, 'day');
      });
    },
    [workspace.pages]
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

  return useMemo(
    () => ({
      getJournalsByDate,
      getJournalByDate,
      openJournal,
      openToday,
    }),
    [getJournalByDate, getJournalsByDate, openJournal, openToday]
  );
};

export const useJournalInfoHelper = (pageMeta?: PageMeta) => {
  const isJournal = isPageJournal(pageMeta);
  const journalDate = useMemo(() => getJournalDate(pageMeta), [pageMeta]);

  return useMemo(
    () => ({
      isJournal,
      journalDate,
    }),
    [isJournal, journalDate]
  );
};
