import { OnEvent, Service } from '@toeverything/infra';

import { DocCreated, type DocRecord } from '../../doc';
import type { DocCreateOptions } from '../../doc/types';
import type { WorkspaceServerService } from './workspace-server';

@OnEvent(DocCreated, t => t.onDocCreated)
export class DocCreatedByService extends Service {
  constructor(private readonly workspaceServerService: WorkspaceServerService) {
    super();
  }

  onDocCreated(event: { doc: DocRecord; docCreateOptions: DocCreateOptions }) {
    const account = this.workspaceServerService.server?.account$.value;
    if (account) {
      event.doc.setCreatedBy(account.id);
    }
  }
}
