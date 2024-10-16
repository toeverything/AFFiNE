import { LiveData, Service } from '@toeverything/infra';

import type { JournalStore } from '../store/journal';

export class JournalService extends Service {
  constructor(private readonly store: JournalStore) {
    super();
  }

  journalDate$(docId: string) {
    return LiveData.from(this.store.watchDocJournalDate(docId), undefined);
  }

  setJournalDate(docId: string, date: string) {
    this.store.setDocJournalDate(docId, date);
  }

  getJournalsByDate(date: string) {
    return this.store.getDocsByJournalDate(date);
  }
}
