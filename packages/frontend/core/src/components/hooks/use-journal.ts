import { EditorSettingService } from '@affine/core/modules/editor-settting';
import { i18nTime } from '@affine/i18n';
import { track } from '@affine/track';
import { type DocCollection, Text } from '@blocksuite/affine/store';
import {
  type DocProps,
  DocsService,
  initDocFromProps,
  useService,
  useServices,
} from '@toeverything/infra';
import dayjs from 'dayjs';
import { useCallback, useMemo } from 'react';

import { WorkbenchService } from '../../modules/workbench';
import { useCurrentWorkspacePropertiesAdapter } from './use-affine-adapter';
import { useDocCollectionHelper } from './use-block-suite-workspace-helper';

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

export const useJournalHelper = (docCollection: DocCollection) => {
  const bsWorkspaceHelper = useDocCollectionHelper(docCollection);
  const { docsService, editorSettingService } = useServices({
    DocsService,
    EditorSettingService,
  });
  const adapter = useCurrentWorkspacePropertiesAdapter();
  const { isPageJournal } = useJournalInfoHelper();

  /**
   * @internal
   */
  const _createJournal = useCallback(
    (maybeDate: MaybeDate) => {
      const day = dayjs(maybeDate);
      const title = day.format(JOURNAL_DATE_FORMAT);
      const page = bsWorkspaceHelper.createDoc();
      docsService.list.setPrimaryMode(page.id, 'page');
      // set created date to match the journal date
      page.collection.setDocMeta(page.id, {
        createDate: dayjs()
          .set('year', day.year())
          .set('month', day.month())
          .set('date', day.date())
          .toDate()
          .getTime(),
      });
      const docProps: DocProps = {
        page: { title: new Text(title) },
        note: editorSettingService.editorSetting.get('affine:note'),
      };
      initDocFromProps(page, docProps);
      adapter.setJournalPageDateString(page.id, title);
      return page;
    },
    [adapter, bsWorkspaceHelper, docsService.list, editorSettingService]
  );

  /**
   * query all journals by date
   */
  const getJournalsByDate = useCallback(
    (maybeDate: MaybeDate) => {
      const day = dayjs(maybeDate);
      return Array.from(docCollection.docs.values()).filter(page => {
        const pageId = page.id;
        if (!isPageJournal(pageId)) return false;
        if (page.meta?.trash) return false;
        const journalDate = adapter.getJournalPageDateString(page.id);
        if (!journalDate) return false;
        return day.isSame(journalDate, 'day');
      });
    },
    [adapter, isPageJournal, docCollection.docs]
  );

  /**
   * get journal by date, create one if not exist
   */
  const getJournalByDate = useCallback(
    (maybeDate: MaybeDate) => {
      const pages = getJournalsByDate(maybeDate);
      if (pages.length) return pages[0].getDoc();
      return _createJournal(maybeDate);
    },
    [_createJournal, getJournalsByDate]
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
      appendContentToToday,
    }),
    [getJournalsByDate, getJournalByDate, appendContentToToday]
  );
};

// split useJournalRouteHelper since it requires a <Route /> context, which may not work in lit
export const useJournalRouteHelper = (docCollection: DocCollection) => {
  const { getJournalByDate } = useJournalHelper(docCollection);
  const workbench = useService(WorkbenchService).workbench;
  /**
   * open journal by date, create one if not exist
   */
  const openJournal = useCallback(
    (maybeDate: MaybeDate, newTab?: boolean) => {
      const page = getJournalByDate(maybeDate);
      workbench.openDoc(page.id, {
        at: newTab ? 'new-tab' : 'active',
      });
      track.$.navigationPanel.journal.navigate({
        to: 'journal',
      });
      return page.id;
    },
    [getJournalByDate, workbench]
  );

  /**
   * open today's journal
   */
  const openToday = useCallback(
    (newTab?: boolean) => {
      const date = dayjs().format(JOURNAL_DATE_FORMAT);
      return openJournal(date, newTab);
    },
    [openJournal]
  );

  return useMemo(
    () => ({
      openJournal,
      openToday,
    }),
    [openJournal, openToday]
  );
};

// get journal info that don't rely on `docCollection`
export const useJournalInfoHelper = (pageId?: string | null) => {
  const adapter = useCurrentWorkspacePropertiesAdapter();

  const isPageJournal = useCallback(
    (pageId: string) => {
      return !!adapter.getJournalPageDateString(pageId);
    },
    [adapter]
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
      return i18nTime(journalDateString, { absolute: { accuracy: 'day' } });
    },
    [getJournalDateString]
  );

  return useMemo(
    () => ({
      isJournal: pageId ? isPageJournal(pageId) : false,
      journalDate: pageId ? toDayjs(getJournalDateString(pageId)) : null,
      localizedJournalDate: pageId
        ? getLocalizedJournalDateString(pageId)
        : null,
      isTodayJournal: pageId ? isPageTodayJournal(pageId) : false,
      isPageJournal,
      isPageTodayJournal,
      getJournalDateString,
      getLocalizedJournalDateString,
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
