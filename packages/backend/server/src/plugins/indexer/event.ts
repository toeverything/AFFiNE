import { Injectable } from '@nestjs/common';

import { JobQueue, OnEvent } from '../../base';

@Injectable()
export class IndexerEvent {
  constructor(private readonly queue: JobQueue) {}

  @OnEvent('doc.grants.changed')
  async reindexDocOnGrantChange({
    workspaceId,
    docId,
  }: Events['doc.grants.changed']) {
    await this.indexDoc({ workspaceId, docId });
  }

  @OnEvent('doc.owner.changed')
  async reindexDocOnOwnerChange({
    workspaceId,
    docId,
  }: Events['doc.owner.changed']) {
    await this.indexDoc({ workspaceId, docId });
  }

  @OnEvent('doc.default_role.changed')
  async reindexDocOnDefaultRoleChange({
    workspaceId,
    docId,
  }: Events['doc.default_role.changed']) {
    await this.indexDoc({ workspaceId, docId });
  }

  @OnEvent('doc.public_state.changed')
  async reindexDocOnPublicStateChange({
    workspaceId,
    docId,
  }: Events['doc.public_state.changed']) {
    await this.indexDoc({ workspaceId, docId });
  }

  @OnEvent('doc.updated')
  async indexDoc({ workspaceId, docId }: Events['doc.updated']) {
    await this.queue.add(
      'indexer.indexDoc',
      {
        workspaceId,
        docId,
      },
      {
        jobId: `indexDoc/${workspaceId}/${docId}`,
        priority: 100,
      }
    );
  }

  @OnEvent('doc.snapshot.updated')
  async indexWorkspace({ workspaceId, docId }: Events['doc.snapshot.updated']) {
    if (workspaceId !== docId) {
      return;
    }

    await this.queue.add(
      'indexer.indexWorkspace',
      { workspaceId },
      { jobId: `indexWorkspace/${workspaceId}`, priority: 100 }
    );
  }

  @OnEvent('user.deleted')
  async deleteUserWorkspaces(payload: Events['user.deleted']) {
    for (const workspace of payload.ownedWorkspaces) {
      await this.queue.add(
        'indexer.deleteWorkspace',
        {
          workspaceId: workspace,
        },
        {
          jobId: `deleteWorkspace/${workspace}`,
          priority: 0,
        }
      );
    }
  }
}
