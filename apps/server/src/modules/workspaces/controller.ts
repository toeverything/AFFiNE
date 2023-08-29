import type { Storage } from '@affine/storage';
import {
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import format from 'pretty-time';

import { StorageProvide } from '../../storage';
import { trimGuid } from '../../utils/doc';
import { Auth, CurrentUser, Publicable } from '../auth';
import { DocManager } from '../doc';
import { UserType } from '../users';
import { PermissionService } from './permission';

@Controller('/api/workspaces')
export class WorkspacesController {
  constructor(
    @Inject(StorageProvide) private readonly storage: Storage,
    private readonly permission: PermissionService,
    private readonly docManager: DocManager
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
    const start = process.hrtime();
    const id = trimGuid(ws, guid);
    if (
      // if a user has the permission
      !(await this.permission.isAccessible(ws, id, user?.id))
    ) {
      throw new ForbiddenException('Permission denied');
    }

    const update = await this.docManager.getLatestUpdate(ws, id);

    if (!update) {
      throw new NotFoundException('Doc not found');
    }

    res.setHeader('content-type', 'application/octet-stream');
    res.send(update);
    console.info('workspaces doc api: ', format(process.hrtime(start)));
  }
}
