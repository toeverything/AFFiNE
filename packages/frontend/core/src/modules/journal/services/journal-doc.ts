import { type DocService, Service } from '@toeverything/infra';

import type { JournalService } from './journal';

export class JournalDocService extends Service {
  constructor(
    private readonly docService: DocService,
    private readonly journalService: JournalService
  ) {
    super();
  }

  readonly journalDate$ = this.journalService.journalDate$(
    this.docService.doc.id
  );

  setJournalDate(date: string) {
    this.journalService.setJournalDate(this.docService.doc.id, date);
  }
}
