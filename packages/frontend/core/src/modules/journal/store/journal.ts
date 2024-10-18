import type { DocsService } from '@toeverything/infra';
import { LiveData, Store } from '@toeverything/infra';
import type { Observable } from 'rxjs';

function isJournalString(j?: string | false) {
  return j ? !!j?.match(/^\d{4}-\d{2}-\d{2}$/) : false;
}

export class JournalStore extends Store {
  constructor(private readonly docsService: DocsService) {
    super();
  }

  allJournalDates$ = LiveData.computed(get => {
    return new Set(
      get(this.docsService.list.docs$)
        .filter(doc => {
          const journal = get(doc.properties$.selector(p => p.journal));
          return !!journal && isJournalString(journal);
        })
        .map(doc => get(doc.properties$.selector(p => p.journal)))
    );
  });

  watchDocJournalDate(docId: string): Observable<string | undefined> {
    return LiveData.computed(get => {
      const doc = get(this.docsService.list.doc$(docId));
      if (!doc) {
        // if doc not exists
        return undefined;
      }
      const journal = get(doc.properties$.selector(p => p.journal));
      if (journal && !isJournalString(journal)) {
        return undefined;
      }
      return journal ?? undefined;
    });
  }

  setDocJournalDate(docId: string, date: string) {
    const doc = this.docsService.list.doc$(docId).value;
    if (!doc) {
      // doc not exists, do nothing
      return;
    }
    doc.setProperty('journal', date);
  }

  removeDocJournalDate(docId: string) {
    this.setDocJournalDate(docId, '');
  }

  getDocsByJournalDate(date: string) {
    return this.docsService.list.docs$.value.filter(
      doc => doc.properties$.value.journal === date
    );
  }
  docsByJournalDate$(date: string) {
    return LiveData.computed(get => {
      return get(this.docsService.list.docs$).filter(doc => {
        const journal = get(doc.properties$.selector(p => p.journal));
        return journal === date;
      });
    });
  }
}
