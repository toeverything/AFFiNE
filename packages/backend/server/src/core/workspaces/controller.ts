import {
  Controller,
  ForbiddenException,
  Get,
  Logger,
  NotFoundException,
  Param,
  Res,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { Response } from 'express';

import { CallTimer } from '../../fundamentals';
import { CurrentUser, Public } from '../auth';
import { DocHistoryManager, DocManager } from '../doc';
import { WorkspaceBlobStorage } from '../storage';
import { DocID } from '../utils/doc';
import { PermissionService, PublicPageMode } from './permission';
import { Permission } from './types';

@Controller('/api/workspaces')
export class WorkspacesController {
  logger = new Logger(WorkspacesController.name);
  constructor(
    private readonly storage: WorkspaceBlobStorage,
    private readonly permission: PermissionService,
    private readonly docManager: DocManager,
    private readonly historyManager: DocHistoryManager,
    private readonly prisma: PrismaClient
  ) {}

  // get workspace blob
  //
  // NOTE: because graphql can't represent a File, so we have to use REST API to get blob
  @Get('/:id/blobs/:name')
  @CallTimer('controllers', 'workspace_get_blob')
  async blob(
    @Param('id') workspaceId: string,
    @Param('name') name: string,
    @Res() res: Response
  ) {
    const { body, metadata } = await this.storage.get(workspaceId, name);

    if (!body) {
      throw new NotFoundException(
        `Blob not found in workspace ${workspaceId}: ${name}`
      );
    }

    // metadata should always exists if body is not null
    if (metadata) {
      res.setHeader('content-type', metadata.contentType);
      res.setHeader('last-modified', metadata.lastModified.toISOString());
      res.setHeader('content-length', metadata.contentLength);
    } else {
      this.logger.warn(`Blob ${workspaceId}/${name} has no metadata`);
    }

    res.setHeader('cache-control', 'public, max-age=2592000, immutable');
    body.pipe(res);
  }

  // get doc binary
  @Get('/:id/docs/:guid')
  @Public()
  @CallTimer('controllers', 'workspace_get_doc')
  async doc(
    @CurrentUser() user: CurrentUser | undefined,
    @Param('id') ws: string,
    @Param('guid') guid: string,
    @Res() res: Response
  ) {
    const docId = new DocID(guid, ws);
    if (
      // if a user has the permission
      !(await this.permission.isAccessible(
        docId.workspace,
        docId.guid,
        user?.id
      ))
    ) {
      throw new ForbiddenException('Permission denied');
    }

    const update = await this.docManager.getBinary(docId.workspace, docId.guid);

    if (!update) {
      throw new NotFoundException('Doc not found');
    }

    if (!docId.isWorkspace) {
      // fetch the publish page mode for publish page
      const publishPage = await this.prisma.workspacePage.findUnique({
        where: {
          workspaceId_pageId: {
            workspaceId: docId.workspace,
            pageId: docId.guid,
          },
        },
      });
      const publishPageMode =
        publishPage?.mode === PublicPageMode.Edgeless ? 'edgeless' : 'page';

      res.setHeader('publish-mode', publishPageMode);
    }

    res.setHeader('content-type', 'application/octet-stream');
    res.setHeader('cache-control', 'no-cache');
    res.send(update);
  }

  @Get('/:id/docs/:guid/histories/:timestamp')
  @CallTimer('controllers', 'workspace_get_history')
  async history(
    @CurrentUser() user: CurrentUser,
    @Param('id') ws: string,
    @Param('guid') guid: string,
    @Param('timestamp') timestamp: string,
    @Res() res: Response
  ) {
    const docId = new DocID(guid, ws);
    let ts;
    try {
      ts = new Date(timestamp);
    } catch (e) {
      throw new Error('Invalid timestamp');
    }

    await this.permission.checkPagePermission(
      docId.workspace,
      docId.guid,
      user.id,
      Permission.Write
    );

    const history = await this.historyManager.get(
      docId.workspace,
      docId.guid,
      ts
    );

    if (history) {
      res.setHeader('content-type', 'application/octet-stream');
      res.setHeader('cache-control', 'public, max-age=2592000, immutable');
      res.send(history.blob);
    } else {
      throw new NotFoundException('Doc history not found');
    }
  }
}
