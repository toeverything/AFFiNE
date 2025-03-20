import { Store } from '@toeverything/infra';

import type { WorkspaceDBService } from '../../db';
import type { DocIntegrationRef } from '../../db/schema/schema';
import type { DocsService } from '../../doc';

export class IntegrationRefStore extends Store {
  constructor(
    private readonly dbService: WorkspaceDBService,
    private readonly docsService: DocsService
  ) {
    super();
  }

  get userDB() {
    return this.dbService.userdataDB$.value.db;
  }
  get allDocsMap() {
    return this.docsService.list.docsMap$.value;
  }

  getRefs(where: Parameters<typeof this.userDB.docIntegrationRef.find>[0]) {
    const refs = this.userDB.docIntegrationRef.find({
      ...where,
    });
    return refs.filter(ref => {
      const docExists = this.allDocsMap.has(ref.id);
      if (!docExists) this.deleteRef(ref.id);
      return docExists;
    });
  }

  createRef(docId: string, config: Omit<DocIntegrationRef, 'id'>) {
    return this.userDB.docIntegrationRef.create({
      id: docId,
      ...config,
    });
  }

  updateRef(docId: string, config: Partial<DocIntegrationRef>) {
    return this.userDB.docIntegrationRef.update(docId, config);
  }

  deleteRef(docId: string) {
    return this.userDB.docIntegrationRef.delete(docId);
  }
}
