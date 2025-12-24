import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { Config, JobQueue, OnEvent } from '../../base';

@Injectable()
export class IndexerEvent {
  constructor(
    private readonly queue: JobQueue,
    private readonly config: Config
  ) {}

  @OnEvent('doc.updated')
  async indexDoc({ workspaceId, docId }: Events['doc.updated']) {
    if (!this.config.indexer.enabled) {
      return;
    }

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

  @OnEvent('workspace.updated')
  async indexWorkspace({ id }: Events['workspace.updated']) {
    if (!this.config.indexer.enabled) {
      return;
    }

    await this.queue.add(
      'indexer.indexWorkspace',
      {
        workspaceId: id,
      },
      {
        jobId: `indexWorkspace/${id}`,
        priority: 100,
      }
    );
  }

  @OnEvent('user.deleted')
  async deleteUserWorkspaces(payload: Events['user.deleted']) {
    if (!this.config.indexer.enabled) {
      return;
    }

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

  @Cron(CronExpression.EVERY_30_SECONDS)
  async autoIndexWorkspaces() {
    if (!this.config.indexer.enabled) {
      return;
    }

    await this.queue.add(
      'indexer.autoIndexWorkspaces',
      {},
      {
        // make sure only one job is running at a time
        delay: 30 * 1000,
        jobId: 'autoIndexWorkspaces',
      }
    );
  }
}
