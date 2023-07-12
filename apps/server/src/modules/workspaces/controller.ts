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
import * as Y from 'yjs';

import { Metrics } from '../../metrics/metrics';
import { StorageProvide } from '../../storage';
import { PermissionService } from './permission';

@Controller('/api/workspaces')
export class WorkspacesController {
  constructor(
    @Inject(StorageProvide) private readonly storage: Storage,
    private readonly permission: PermissionService,
    private readonly metric: Metrics
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
    this.metric.restRequest(1, {
      method: 'GET',
      path: '/api/workspace/:id/blobs/:name',
      job: 'get workspace blob',
    });
    const blob = await this.storage.getBlob(workspaceId, name);

    if (!blob) {
      throw new NotFoundException('Blob not found');
    }

    res.setHeader('content-type', blob.contentType);
    res.setHeader('last-modified', blob.lastModified);
    res.setHeader('content-length', blob.size);

    res.send(blob.data);
  }

  // get doc binary
  //
  // NOTE: only for public workspace, normal workspace update should be load from websocket sync logic
  @Get('/:id/docs/:guid')
  async doc(
    @Param('id') ws: string,
    @Param('guid') guid: string,
    @Res() res: Response
  ) {
    const metricsLabel = {
      method: 'GET',
      path: '/api/workspace/:id/docs/:guid',
      job: 'get doc binary',
    };
    this.metric.restRequest(1, metricsLabel);
    await this.permission.check(ws);

    const updates = await this.storage.loadBuffer(guid);

    if (!updates) {
      this.metric.restError(1, metricsLabel);
      throw new NotFoundException('Doc not found');
    }

    const doc = new Y.Doc({ guid });
    for (const update of updates) {
      try {
        Y.applyUpdate(doc, update);
      } catch (e) {
        this.metric.docApplyUpdateErr(1, {});
        console.error(e);
      }
    }

    res.setHeader('content-type', 'application/octet-stream');
    res.send(Buffer.from(Y.encodeStateAsUpdate(doc)));
  }
}
