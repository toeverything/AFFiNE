import { LiveData, Service } from '@toeverything/infra';
import dayjs from 'dayjs';

import type { JournalStore } from '../store/journal';

export class JournalService extends Service {
  constructor(private readonly store: JournalStore) {
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

  getJournalsByDate(date: string) {
    return this.store.getDocsByJournalDate(date);
  }
  journalsByDate$(date: string) {
    return this.store.docsByJournalDate$(date);
  }
}
