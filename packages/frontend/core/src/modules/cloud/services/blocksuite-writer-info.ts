import { WriterInfoServiceExtension } from '@blocksuite/affine/shared/services';
import { OnEvent, Service } from '@toeverything/infra';

import { type Workspace, WorkspaceInitialized } from '../../workspace';
import type { DocImpl } from '../../workspace/impls/doc';
import type { WorkspaceServerService } from './workspace-server';

/**
 * This service is used to set the writer info for the blocksuite editor.
 */
@OnEvent(WorkspaceInitialized, i => i.onWorkspaceInitialized)
export class BlocksuiteWriterInfoService extends Service {
  constructor(private readonly workspaceServerService: WorkspaceServerService) {
    super();
  }

  onWorkspaceInitialized(workspace: Workspace) {
    const setWriterInfo = (doc: DocImpl) => {
      const account = this.workspaceServerService.server?.account$.value;
      doc.awarenessStore.awareness.setLocalStateField('user', {
        name: account?.label,
      });
      doc.storeExtensions.push(
        WriterInfoServiceExtension({
          getWriterInfo: () => {
            if (!account) {
              return null;
            }
            return {
              id: account.id,
              name: account.label,
              avatar: account.avatar,
            };
          },
        })
      );
    };
    const subscription = workspace.docCollection.meta.docMetaAdded.subscribe(
      docId => {
        const doc = workspace.docCollection.docs.get(docId) as DocImpl;
        setWriterInfo(doc);
      }
    );
    this.disposables.push(() => subscription.unsubscribe.bind(subscription));
  }
}
