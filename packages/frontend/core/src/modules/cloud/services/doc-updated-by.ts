import { OnEvent, Service } from '@toeverything/infra';
import { throttle } from 'lodash-es';
import type { Transaction } from 'yjs';

import type { Doc } from '../../doc';
import { DocInitialized } from '../../doc/events';
import type { WorkspaceServerService } from './workspace-server';

@OnEvent(DocInitialized, t => t.onDocInitialized)
export class DocUpdatedByService extends Service {
  constructor(private readonly workspaceServerService: WorkspaceServerService) {
    super();
  }

  onDocInitialized(doc: Doc) {
    const handleTransactionThrottled = throttle(
      (trx: Transaction) => {
        if (trx.local) {
          const account = this.workspaceServerService.server?.account$.value;
          if (account) {
            doc.setUpdatedBy(account.id);
          }
        }
      },
      1000,
      {
        leading: true,
        trailing: true,
      }
    );
    doc.yDoc.on('afterTransaction', handleTransactionThrottled);
    this.disposables.push(() => {
      doc.yDoc.off('afterTransaction', handleTransactionThrottled);
      handleTransactionThrottled.cancel();
    });
  }
}
