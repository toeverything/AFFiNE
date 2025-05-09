import { LiveData, Service } from '@toeverything/infra';
import dayjs from 'dayjs';

import type { DocsService } from '../../doc';
import type { TemplateDocService } from '../../template-doc';
import type { JournalStore } from '../store/journal';

export type MaybeDate = Date | string | number;

export const JOURNAL_DATE_FORMAT = 'YYYY-MM-DD';

export class JournalService extends Service {
  constructor(
    private readonly store: JournalStore,
    private readonly docsService: DocsService,
    private readonly templateDocService: TemplateDocService
  ) {
    super();
  }

  allJournalDates$ = this.store.allJournalDates$;

  journalDate$(docId: string) {
    return LiveData.from(this.store.watchDocJournalDate(docId), undefined);
  }
  journalToday$(docId: string) {
    return LiveData.computed(get => {
      const date = get(this.journalDate$(docId));
      if (!date) return false;
      return dayjs(date).isSame(dayjs(), 'day');
    });
  }

  setJournalDate(docId: string, date: string) {
    this.store.setDocJournalDate(docId, date);
  }

  removeJournalDate(docId: string) {
    this.store.removeDocJournalDate(docId);
  }

  journalsByDate$(date: string) {
    return this.store.docsByJournalDate$(date);
  }

  private createJournal(maybeDate: MaybeDate) {
    const day = dayjs(maybeDate);
    const title = day.format(JOURNAL_DATE_FORMAT);
    const docRecord = this.docsService.createDoc({
      title,
    });
    // set created date to match the journal date
    docRecord.setMeta({
      createDate: dayjs()
        .set('year', day.year())
        .set('month', day.month())
        .set('date', day.date())
        .toDate()
        .getTime(),
    });

    const enablePageTemplate =
      this.templateDocService.setting.enablePageTemplate$.value;
    const pageTemplateDocId =
      this.templateDocService.setting.pageTemplateDocId$.value;
    const journalTemplateDocId =
      this.templateDocService.setting.journalTemplateDocId$.value;
    // if journal template configured
    if (journalTemplateDocId) {
      this.docsService
        .duplicateFromTemplate(journalTemplateDocId, docRecord.id)
        .catch(console.error);
    }
    // journal template not configured, use page template
    else if (enablePageTemplate && pageTemplateDocId) {
      this.docsService
        .duplicateFromTemplate(pageTemplateDocId, docRecord.id)
        .catch(console.error);
    }
    this.setJournalDate(docRecord.id, title);
    return docRecord;
  }

  ensureJournalByDate(maybeDate: MaybeDate) {
    const day = dayjs(maybeDate);
    const title = day.format(JOURNAL_DATE_FORMAT);
    const docs = this.journalsByDate$(title).value;
    if (docs.length) return docs[0];
    return this.createJournal(maybeDate);
  }
}
