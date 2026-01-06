import { getQueueToken } from '@nestjs/bullmq';
import { Injectable, Logger, Module, OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost, ModuleRef } from '@nestjs/core';
import { createQueueDashExpressMiddleware } from '@queuedash/api';
import type { Queue as BullMQQueue } from 'bullmq';
import type { Application, NextFunction, Request, Response } from 'express';

import { Config } from '../../base/config';
import { QUEUES } from '../../base/job/queue/def';
import { AuthGuard, AuthModule } from '../auth';
import { FeatureModule, FeatureService } from '../features';

type QueueDashQueue = {
  queue: BullMQQueue;
  displayName: string;
  type: 'bullmq';
};

@Injectable()
class QueueDashboardService implements OnModuleInit {
  private readonly logger = new Logger(QueueDashboardService.name);

  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly config: Config,
    private readonly feature: FeatureService,
    private readonly authGuard: AuthGuard,
    private readonly moduleRef: ModuleRef
  ) {}

  async onModuleInit() {
    const httpAdapter = this.adapterHost.httpAdapter;
    if (!httpAdapter) {
      return;
    }

    const app = httpAdapter.getInstance<Application>();
    const mountPath = `${this.config.server.path}/api/queue`;

    const queues = this.collectQueues();
    if (!queues.length) {
      this.logger.warn('QueueDash not mounted: no queues available');
      app.use(mountPath, (_req, res) => {
        res.status(404).end();
      });
      return;
    }

    const guardMiddleware = async (
      req: Request,
      res: Response,
      next: NextFunction
    ): Promise<void> => {
      try {
        const session = await this.authGuard.signIn(req, res);
        const userId = session?.user?.id;
        const isAdmin = userId ? await this.feature.isAdmin(userId) : false;
        if (!isAdmin) {
          res.status(404).end();
          return;
        }
      } catch (error) {
        this.logger.warn('QueueDash auth failed', error as Error);
        res.status(404).end();
        return;
      }

      next();
    };

    app.use(
      mountPath,
      guardMiddleware,
      createQueueDashExpressMiddleware({ ctx: { queues } })
    );
    this.logger.log(`QueueDash mounted on ${mountPath}`);
  }

  private collectQueues(): QueueDashQueue[] {
    const queues: QueueDashQueue[] = [];

    for (const name of QUEUES) {
      const queue = this.moduleRef.get<BullMQQueue>(getQueueToken(name), {
        strict: false,
      });

      if (queue) {
        queues.push({ queue, displayName: name, type: 'bullmq' });
      }
    }

    return queues;
  }
}

@Module({
  imports: [AuthModule, FeatureModule],
  providers: [QueueDashboardService],
})
export class QueueDashboardModule {}
