import type { Storage } from '@affine/storage';
import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import format from 'pretty-time';

import { Metrics } from '../../metrics/metrics';
import { StorageProvide } from '../../storage';
import { Auth, CurrentUser, Publicable } from '../auth';
import { DocManager } from '../doc';
import { UserType } from '../users';
import { PermissionService } from './permission';

@Controller('/api/workspaces')
export class WorkspacesController {
  constructor(
    @Inject(StorageProvide) private readonly storage: Storage,
    private readonly permission: PermissionService,
    private readonly docManager: DocManager,
    private readonly metrics: Metrics
  ) {}

  // get workspace blob
  //
  // NOTE: because graphql can't represent a File, so we have to use REST API to get blob
  @Get('/:id/blobs/:name')
  async blob(
    @Param('id') workspaceId: string,
    @Param('name') name: string,
    @Res() res: Response
  ) {
    const path = '/api/workspaces/:id/blobs/:name';
    this.metrics.metricsRestApiCounter(1, { path });
    const timer = this.metrics.metricsRestApiTimer({ path });

    const blob = await this.storage.getBlob(workspaceId, name);

    if (!blob) {
      throw new NotFoundException('Blob not found');
    }

    res.setHeader('content-type', blob.contentType);
    res.setHeader('last-modified', blob.lastModified);
    res.setHeader('content-length', blob.size);

    res.send(blob.data);
    timer();
  }

  // get doc binary
  @Get('/:id/docs/:guid')
  @Auth()
  @Publicable()
  async doc(
    @CurrentUser() user: UserType | undefined,
    @Param('id') ws: string,
    @Param('guid') guid: string,
    @Res() res: Response
  ) {
    const path = '/api/workspaces/:id/docs/:guid';
    this.metrics.metricsRestApiCounter(1, { path });
    const timer = this.metrics.metricsRestApiTimer({ path });

    const start = process.hrtime();
    await this.permission.check(ws, user?.id);

    const update = await this.docManager.getLatest(ws, guid);

    if (!update) {
      throw new NotFoundException('Doc not found');
    }

    res.setHeader('content-type', 'application/octet-stream');
    res.send(update);
    console.info('workspaces doc api: ', format(process.hrtime(start)));
    timer();
  }
}
