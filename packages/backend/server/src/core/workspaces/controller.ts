import { Controller, Get, Logger, Param, Res } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { Response } from 'express';

import {
  AccessDenied,
  ActionForbidden,
  BlobNotFound,
  CallMetric,
  DocHistoryNotFound,
  DocNotFound,
  InvalidHistoryTimestamp,
} from '../../fundamentals';
import { CurrentUser, Public } from '../auth';
import { PgWorkspaceDocStorageAdapter } from '../doc';
import { Permission, PermissionService, PublicPageMode } from '../permission';
import { WorkspaceBlobStorage } from '../storage';
import { DocID } from '../utils/doc';

@Controller('/api/workspaces')
export class WorkspacesController {
  logger = new Logger(WorkspacesController.name);
  constructor(
    private readonly storage: WorkspaceBlobStorage,
    private readonly permission: PermissionService,
    private readonly workspace: PgWorkspaceDocStorageAdapter,
    private readonly prisma: PrismaClient
  ) {}

  // get workspace blob
  //
  // NOTE: because graphql can't represent a File, so we have to use REST API to get blob
  @Public()
  @Get('/:id/blobs/:name')
  @CallMetric('controllers', 'workspace_get_blob')
  async blob(
    @CurrentUser() user: CurrentUser | undefined,
    @Param('id') workspaceId: string,
    @Param('name') name: string,
    @Res() res: Response
  ) {
    // if workspace is public or have any public page, then allow to access
    // otherwise, check permission
    if (
      !(await this.permission.isPublicAccessible(
        workspaceId,
        workspaceId,
        user?.id
      ))
    ) {
      throw new ActionForbidden();
    }

    const { body, metadata } = await this.storage.get(workspaceId, name);

    if (!body) {
      throw new BlobNotFound({
        spaceId: workspaceId,
        blobId: name,
      });
    }

    // metadata should always exists if body is not null
    if (metadata) {
      res.setHeader('content-type', metadata.contentType);
      res.setHeader('last-modified', metadata.lastModified.toUTCString());
      res.setHeader('content-length', metadata.contentLength);
    } else {
      this.logger.warn(`Blob ${workspaceId}/${name} has no metadata`);
    }

    res.setHeader('cache-control', 'public, max-age=2592000, immutable');
    body.pipe(res);
  }

  // get doc binary
  @Public()
  @Get('/:id/docs/:guid')
  @CallMetric('controllers', 'workspace_get_doc')
  async doc(
    @CurrentUser() user: CurrentUser | undefined,
    @Param('id') ws: string,
    @Param('guid') guid: string,
    @Res() res: Response
  ) {
    const docId = new DocID(guid, ws);
    if (
      // if a user has the permission
      !(await this.permission.isPublicAccessible(
        docId.workspace,
        docId.guid,
        user?.id
      ))
    ) {
      throw new AccessDenied();
    }

    const binResponse = await this.workspace.getDoc(
      docId.workspace,
      docId.guid
    );

    if (!binResponse) {
      throw new DocNotFound({
        spaceId: docId.workspace,
        docId: docId.guid,
      });
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
    res.send(binResponse.bin);
  }

  @Get('/:id/docs/:guid/histories/:timestamp')
  @CallMetric('controllers', 'workspace_get_history')
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
    } catch {
      throw new InvalidHistoryTimestamp({ timestamp });
    }

    await this.permission.checkPagePermission(
      docId.workspace,
      docId.guid,
      user.id,
      Permission.Write
    );

    const history = await this.workspace.getDocHistory(
      docId.workspace,
      docId.guid,
      ts.getTime()
    );

    if (history) {
      res.setHeader('content-type', 'application/octet-stream');
      res.setHeader('cache-control', 'private, max-age=2592000, immutable');
      res.send(history.bin);
    } else {
      throw new DocHistoryNotFound({
        spaceId: docId.workspace,
        docId: guid,
        timestamp: ts.getTime(),
      });
    }
  }
}
