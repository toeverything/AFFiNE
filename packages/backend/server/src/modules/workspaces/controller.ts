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

import { CallTimer } from '../../metrics';
import { PrismaService } from '../../prisma';
import { StorageProvide } from '../../storage';
import { DocID } from '../../utils/doc';
import { Auth, CurrentUser, Publicable } from '../auth';
import { DocHistoryManager, DocManager } from '../doc';
import { UserType } from '../users';
import { PermissionService, PublicPageMode } from './permission';
import { Permission } from './types';

@Controller('/api/workspaces')
export class WorkspacesController {
  constructor(
    @Inject(StorageProvide) private readonly storage: Storage,
    private readonly permission: PermissionService,
    private readonly docManager: DocManager,
    private readonly historyManager: DocHistoryManager,
    private readonly prisma: PrismaService
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
    const blob = await this.storage.getBlob(workspaceId, name);

    if (!blob) {
      throw new NotFoundException(
        `Blob not found in workspace ${workspaceId}: ${name}`
      );
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
  @CallTimer('controllers', 'workspace_get_doc')
  async doc(
    @CurrentUser() user: UserType | undefined,
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
    res.send(update);
  }

  @Get('/:id/docs/:guid/histories/:timestamp')
  @Auth()
  @CallTimer('controllers', 'workspace_get_history')
  async history(
    @CurrentUser() user: UserType,
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
      res.send(history.blob);
    } else {
      throw new NotFoundException('Doc history not found');
    }
  }
}
