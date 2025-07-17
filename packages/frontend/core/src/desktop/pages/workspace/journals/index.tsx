import {
  Button,
  WeekDatePicker,
  type WeekDatePickerHandle,
} from '@affine/component';
import { BlocksuiteEditorJournalDocTitleUI } from '@affine/core/blocksuite/block-suite-editor/journal-doc-title';
import { FeatureFlagService } from '@affine/core/modules/feature-flag';
import {
  JOURNAL_DATE_FORMAT,
  JournalService,
} from '@affine/core/modules/journal';
import {
  ViewBody,
  ViewHeader,
  ViewIcon,
  ViewService,
  ViewTitle,
  WorkbenchService,
} from '@affine/core/modules/workbench';
import { useI18n } from '@affine/i18n';
import { TodayIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import dayjs from 'dayjs';
import type { Location } from 'history';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import { AllDocSidebarTabs } from '../layouts/all-doc-sidebar-tabs';
import * as styles from './index.css';

function getDateFromUrl(location: Location) {
  const searchParams = new URLSearchParams(location.search);
  const date = searchParams.get('date')
    ? dayjs(searchParams.get('date'))
    : dayjs();
  return date.format(JOURNAL_DATE_FORMAT);
}

const weekStyle = { maxWidth: 800, width: '100%' };
// this route page acts as a redirector to today's journal
export const JournalsPageWithConfirmation = () => {
  const handleRef = useRef<WeekDatePickerHandle>(null);

  const t = useI18n();
  const journalService = useService(JournalService);
  const workbench = useService(WorkbenchService).workbench;
  const view = useService(ViewService).view;
  const location = useLiveData(view.location$);
  const dateString = getDateFromUrl(location);
  const todayString = dayjs().format(JOURNAL_DATE_FORMAT);
  const isToday = dateString === todayString;

  const [redirecting, setRedirecting] = useState(false);
  const [ready, setReady] = useState(false);

  const createJournal = useCallback(() => {
    if (redirecting) return;
    setRedirecting(true);
    const doc = journalService.ensureJournalByDate(dateString);
    workbench.openDoc(doc.id, {
      replaceHistory: true,
      at: 'active',
    });
  }, [dateString, journalService, redirecting, workbench]);

  const openJournal = useCallback(
    (date: string) => {
      workbench.open(`/journals?date=${date}`, { at: 'active' });
    },
    [workbench]
  );

  useLayoutEffect(() => {
    // only handle current route
    if (!location.pathname.startsWith('/journals')) return;

    // check if the journal is created
    const docs = journalService.journalsByDate$(dateString).value;
    if (docs.length === 0) {
      setReady(true);
      return;
    }

    // if created, redirect to the journal
    const journal = docs[0];
    workbench.openDoc(journal.id, { replaceHistory: true, at: 'active' });
  }, [dateString, journalService, location.pathname, view, workbench]);

  if (!ready) return null;

  return (
    <>
      <ViewTitle title="" />
      <ViewIcon icon="journal" />
      <ViewHeader>
        <div className={styles.header}>
          <WeekDatePicker
            data-testid="journal-week-picker"
            handleRef={handleRef}
            style={weekStyle}
            value={dateString}
            onChange={openJournal}
          />

          {!isToday ? (
            <Button
              className={styles.todayButton}
              onClick={() => openJournal(todayString)}
            >
              {t['com.affine.today']()}
            </Button>
          ) : null}
        </div>
      </ViewHeader>
      <ViewBody>
        <div className={styles.body}>
          <div className={styles.content}>
            <BlocksuiteEditorJournalDocTitleUI
              date={dateString}
              overrideClassName={styles.docTitleContainer}
            />
            <div className={styles.placeholder}>
              <div className={styles.placeholderIcon}>
                <TodayIcon />
              </div>
              <div className={styles.placeholderText}>
                {t['com.affine.journal.placeholder.title']()}
              </div>
              <Button
                variant="primary"
                onClick={createJournal}
                data-testid="confirm-create-journal-button"
              >
                {t['com.affine.journal.placeholder.create']()}
              </Button>
            </div>
          </div>
        </div>
      </ViewBody>
      <AllDocSidebarTabs />
    </>
  );
};

export const JournalsPageWithoutConfirmation = () => {
  const journalService = useService(JournalService);
  const workbench = useService(WorkbenchService).workbench;

  useEffect(() => {
    const today = dayjs().format(JOURNAL_DATE_FORMAT);
    const doc = journalService.ensureJournalByDate(today);
    workbench.openDoc(doc.id, {
      replaceHistory: true,
      at: 'active',
    });
  }, [journalService, workbench]);

  return null;
};

export const Component = () => {
  const featureFlagService = useService(FeatureFlagService);
  const isTwoStepJournalConfirmationEnabled = useLiveData(
    featureFlagService.flags.enable_two_step_journal_confirmation.$
  );

  if (isTwoStepJournalConfirmationEnabled) {
    return <JournalsPageWithConfirmation />;
  }

  return <JournalsPageWithoutConfirmation />;
};
