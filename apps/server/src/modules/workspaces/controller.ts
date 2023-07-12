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

import { StorageProvide } from '../../storage';
import { Auth, CurrentUser, Publicable } from '../auth';
import { UserType } from '../users';
import { PermissionService } from './permission';

@Controller('/api/workspaces')
export class WorkspacesController {
  constructor(
    @Inject(StorageProvide) private readonly storage: Storage,
    private readonly permission: PermissionService
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
  @Get('/:id/docs/:guid')
  @Auth()
  @Publicable()
  async doc(
    @CurrentUser() user: UserType | undefined,
    @Param('id') ws: string,
    @Param('guid') guid: string,
    @Res() res: Response
  ) {
    console.time('workspaces doc api');
    await this.permission.check(ws, user?.id);

    const updates = await this.storage.loadBuffer(guid);

    if (!updates) {
      throw new NotFoundException('Doc not found');
    }

    const doc = new Y.Doc({ guid });
    for (const update of updates) {
      try {
        Y.applyUpdate(doc, update);
      } catch (e) {
        console.error(e);
      }
    }
    const content = Buffer.from(Y.encodeStateAsUpdate(doc));
    res.setHeader('content-type', 'application/octet-stream');
    res.send(content);
    console.timeEnd('workspaces doc api');
  }
}
