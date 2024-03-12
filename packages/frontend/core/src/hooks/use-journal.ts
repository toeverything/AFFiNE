import { initEmptyPage } from '@toeverything/infra';
import dayjs from 'dayjs';
import { useCallback, useMemo } from 'react';

import type { BlockSuiteWorkspace } from '../shared';
import { timestampToLocalDate } from '../utils';
import { useCurrentWorkspacePropertiesAdapter } from './use-affine-adapter';
import { useBlockSuiteWorkspaceHelper } from './use-block-suite-workspace-helper';
import { useNavigateHelper } from './use-navigate-helper';

type MaybeDate = Date | string | number;
export const JOURNAL_DATE_FORMAT = 'YYYY-MM-DD';

function isJournalString(j?: string | false) {
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
  const adapter = useCurrentWorkspacePropertiesAdapter();

  /**
   * @internal
   */
  const _createJournal = useCallback(
    (maybeDate: MaybeDate) => {
      const day = dayjs(maybeDate);
      const title = day.format(JOURNAL_DATE_FORMAT);
      const page = bsWorkspaceHelper.createDoc();
      // set created date to match the journal date
      page.workspace.setDocMeta(page.id, {
        createDate: dayjs()
          .set('year', day.year())
          .set('month', day.month())
          .set('date', day.date())
          .toDate()
          .getTime(),
      });
      initEmptyPage(page, title);
      adapter.setJournalPageDateString(page.id, title);
      return page;
    },
    [adapter, bsWorkspaceHelper]
  );

  const isPageJournal = useCallback(
    (pageId: string) => {
      return !!adapter.getJournalPageDateString(pageId);
    },
    [adapter]
  );

  /**
   * query all journals by date
   */
  const getJournalsByDate = useCallback(
    (maybeDate: MaybeDate) => {
      const day = dayjs(maybeDate);
      return Array.from(workspace.docs.values()).filter(page => {
        const pageId = page.id;
        if (!isPageJournal(pageId)) return false;
        if (page.meta?.trash) return false;
        const journalDate = adapter.getJournalPageDateString(page.id);
        if (!journalDate) return false;
        return day.isSame(journalDate, 'day');
      });
    },
    [adapter, isPageJournal, workspace.docs]
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

  const isPageTodayJournal = useCallback(
    (pageId: string) => {
      const date = dayjs().format(JOURNAL_DATE_FORMAT);
      const d = adapter.getJournalPageDateString(pageId);
      return isPageJournal(pageId) && d === date;
    },
    [adapter, isPageJournal]
  );

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

  const appendContentToToday = useCallback(
    async (content: string) => {
      if (!content) return;
      const page = getJournalByDate(dayjs().format(JOURNAL_DATE_FORMAT));
      if (!page) return;
      const blockId = page.addBlock(
        'affine:paragraph',
        { text: new page.Text(content) },
        page.getBlockByFlavour('affine:note')[0].id
      );
      return { page, blockId };
    },
    [getJournalByDate]
  );

  return useMemo(
    () => ({
      getJournalsByDate,
      getJournalByDate,
      getJournalDateString,
      getLocalizedJournalDateString,
      isPageJournal,
      isPageTodayJournal,
      appendContentToToday,
    }),
    [
      getJournalByDate,
      getJournalDateString,
      getJournalsByDate,
      getLocalizedJournalDateString,
      isPageJournal,
      isPageTodayJournal,
      appendContentToToday,
    ]
  );
};

// split useJournalRouteHelper since it requires a <Route /> context, which may not work in lit
export const useJournalRouteHelper = (workspace: BlockSuiteWorkspace) => {
  const navigateHelper = useNavigateHelper();
  const { getJournalByDate } = useJournalHelper(workspace);
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
      openJournal,
      openToday,
    }),
    [openJournal, openToday]
  );
};

export const useJournalInfoHelper = (
  workspace: BlockSuiteWorkspace,
  pageId?: string | null
) => {
  const {
    isPageJournal,
    getJournalDateString,
    getLocalizedJournalDateString,
    isPageTodayJournal,
  } = useJournalHelper(workspace);

  return useMemo(
    () => ({
      isJournal: pageId ? isPageJournal(pageId) : false,
      journalDate: pageId ? toDayjs(getJournalDateString(pageId)) : null,
      localizedJournalDate: pageId
        ? getLocalizedJournalDateString(pageId)
        : null,
      isTodayJournal: pageId ? isPageTodayJournal(pageId) : false,
    }),
    [
      getJournalDateString,
      getLocalizedJournalDateString,
      isPageJournal,
      isPageTodayJournal,
      pageId,
    ]
  );
};
