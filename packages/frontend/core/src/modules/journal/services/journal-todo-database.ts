import { Service } from '@toeverything/infra';

import type {
  JournalTodoDatabaseRef,
  JournalTodoDatabaseStore,
} from '../store/journal-todo-database';

export class JournalTodoDatabaseService extends Service {
  constructor(private readonly store: JournalTodoDatabaseStore) {
    super();
  }

  journalTodoDatabaseRef$ = this.store.journalTodoDatabaseRef$;

  getJournalTodoDatabaseRef(): JournalTodoDatabaseRef | undefined {
    return this.store.getJournalTodoDatabaseRef();
  }

  setJournalTodoDatabaseRef(ref: JournalTodoDatabaseRef | undefined) {
    this.store.setJournalTodoDatabaseRef(ref);
  }
}
