import { createHash } from 'node:crypto';

import {
  Controller,
  Get,
  Head,
  Logger,
  Param,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import {
  applyAttachHeaders,
  BlobNotFound,
  CallMetric,
  CommentAttachmentNotFound,
  DocActionDenied,
  DocHistoryNotFound,
  DocNotFound,
  getRequestTrackerId,
  InvalidHistoryTimestamp,
  SpaceAccessDenied,
} from '../../base';
import { DocMode, Models, PublicDocMode } from '../../models';
import { buildPublicRootDoc } from '../../native';
import { CurrentUser, Public } from '../auth';
import { PgWorkspaceDocStorageAdapter } from '../doc';
import { DocReader } from '../doc/reader';
import { AccessController, WorkspacePolicyService } from '../permission';
import { CommentAttachmentStorage, WorkspaceBlobStorage } from '../storage';
import { DocID } from '../utils/doc';

@Controller('/api/workspaces')
export class WorkspacesController {
  logger = new Logger(WorkspacesController.name);
  constructor(
    private readonly storage: WorkspaceBlobStorage,
    private readonly commentAttachmentStorage: CommentAttachmentStorage,
    private readonly ac: AccessController,
    private readonly workspacePolicy: WorkspacePolicyService,
    private readonly workspace: PgWorkspaceDocStorageAdapter,
    private readonly docReader: DocReader,
    private readonly models: Models
  ) {}

  private buildVisitorId(req: Request, workspaceId: string, docId: string) {
    const tracker = getRequestTrackerId(req);
    return createHash('sha256')
      .update(`${workspaceId}:${docId}:${tracker}`)
      .digest('hex');
  }

  private async assertCanReadPublicDoc(
    userId: string,
    workspaceId: string,
    docId: string
  ) {
    const canReadSharedDoc = await this.ac
      .user(userId)
      .doc(workspaceId, docId)
      .can('Doc.Read');
    if (!canReadSharedDoc) {
      throw new DocActionDenied({
        docId,
        spaceId: workspaceId,
        action: 'Doc.Read',
      });
    }
  }

  private async getPublishModeHeader(workspaceId: string, docId: string) {
    const docMeta = await this.models.doc.getMeta(workspaceId, docId, {
      select: {
        mode: true,
      },
    });
    return docMeta?.mode === PublicDocMode.Edgeless
      ? DocMode.edgeless
      : DocMode.page;
  }

  private async getDocBinaryOrThrow(workspaceId: string, docId: string) {
    const binResponse = await this.docReader.getDoc(workspaceId, docId);

    if (!binResponse) {
      throw new DocNotFound({
        spaceId: workspaceId,
        docId,
      });
    }

    return binResponse;
  }

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
    @Query('redirect') redirect: string | undefined,
    @Res() res: Response
  ) {
    const canReadWorkspace = await this.ac
      .user(user?.id ?? 'anonymous')
      .workspace(workspaceId)
      .can('Workspace.Read');
    const canReadSharedWorkspaceBlobs =
      await this.workspacePolicy.canReadWorkspaceBySharedDocs(workspaceId);
    if (!canReadWorkspace && !canReadSharedWorkspaceBlobs) {
      throw new SpaceAccessDenied({ spaceId: workspaceId });
    }
    const { body, metadata, redirectUrl } = await this.storage.get(
      workspaceId,
      name,
      true
    );

    if (redirectUrl) {
      // redirect to signed url
      if (redirect === 'manual') {
        return res.send({
          url: redirectUrl,
        });
      } else {
        return res.redirect(redirectUrl);
      }
    }

    if (!body) {
      throw new BlobNotFound({
        spaceId: workspaceId,
        blobId: name,
      });
    }

    // metadata should always exists if body is not null
    if (metadata) {
      res.setHeader(
        'content-type',
        metadata.contentType.startsWith('application/json') // application/json is reserved for redirect url
          ? 'text/json'
          : metadata.contentType
      );
      res.setHeader('last-modified', metadata.lastModified.toUTCString());
      res.setHeader('content-length', metadata.contentLength);
    } else {
      this.logger.warn(`Blob ${workspaceId}/${name} has no metadata`);
    }
    applyAttachHeaders(res, {
      contentType: metadata?.contentType,
      filename: name,
    });

    res.setHeader('cache-control', 'public, max-age=2592000, immutable');
    body.pipe(res);
  }

  // get doc binary
  @Public()
  @Get('/:id/docs/:guid')
  @CallMetric('controllers', 'workspace_get_doc')
  async doc(
    @CurrentUser() user: CurrentUser | undefined,
    @Req() req: Request,
    @Param('id') ws: string,
    @Param('guid') guid: string,
    @Res() res: Response
  ) {
    const docId = new DocID(guid, ws);
    if (docId.isWorkspace) {
      await this.ac
        .user(user?.id ?? 'anonymous')
        .workspace(ws)
        .assert('Workspace.Read');
    } else {
      await this.ac
        .user(user?.id ?? 'anonymous')
        .doc(ws, guid)
        .assert('Doc.Read');
    }
    const binResponse = await this.docReader.getDoc(
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
      void this.models.workspaceAnalytics
        .recordDocView({
          workspaceId: docId.workspace,
          docId: docId.guid,
          userId: user?.id,
          visitorId: this.buildVisitorId(req, docId.workspace, docId.guid),
          isGuest: !user,
        })
        .catch(error => {
          this.logger.warn(
            `Failed to record doc view: ${docId.workspace}/${docId.guid}`,
            error as Error
          );
        });
    }

    if (!docId.isWorkspace) {
      // fetch the publish page mode for publish page
      const docMeta = await this.models.doc.getMeta(
        docId.workspace,
        docId.guid,
        {
          select: {
            mode: true,
          },
        }
      );
      const publishPageMode =
        docMeta?.mode === PublicDocMode.Edgeless
          ? DocMode.edgeless
          : DocMode.page;

      res.setHeader('publish-mode', publishPageMode);
    }

    res.setHeader('content-type', 'application/octet-stream');
    res.send(binResponse.bin);
  }

  @Public()
  @Head('/:id/public-docs/:docId')
  @CallMetric('controllers', 'workspace_head_public_doc')
  async headPublicDoc(
    @CurrentUser() user: CurrentUser | undefined,
    @Param('id') workspaceId: string,
    @Param('docId') docId: string,
    @Res() res: Response
  ) {
    await this.assertCanReadPublicDoc(
      user?.id ?? 'anonymous',
      workspaceId,
      docId
    );
    const publishPageMode = await this.getPublishModeHeader(workspaceId, docId);

    res.setHeader('publish-mode', publishPageMode);
    res.status(200).end();
  }

  @Public()
  @Get('/:id/public-docs/:docId')
  @CallMetric('controllers', 'workspace_get_public_doc')
  async publicDoc(
    @CurrentUser() user: CurrentUser | undefined,
    @Req() req: Request,
    @Param('id') workspaceId: string,
    @Param('docId') docId: string,
    @Res() res: Response
  ) {
    await this.assertCanReadPublicDoc(
      user?.id ?? 'anonymous',
      workspaceId,
      docId
    );

    const binResponse = await this.getDocBinaryOrThrow(workspaceId, docId);

    void this.models.workspaceAnalytics
      .recordDocView({
        workspaceId,
        docId,
        userId: user?.id,
        visitorId: this.buildVisitorId(req, workspaceId, docId),
        isGuest: !user,
      })
      .catch(error => {
        this.logger.warn(
          `Failed to record doc view: ${workspaceId}/${docId}`,
          error as Error
        );
      });

    res.setHeader(
      'publish-mode',
      await this.getPublishModeHeader(workspaceId, docId)
    );
    res.setHeader('content-type', 'application/octet-stream');
    res.send(binResponse.bin);
  }

  @Public()
  @Get('/:id/public-docs/:docId/root-doc')
  @CallMetric('controllers', 'workspace_get_public_root_doc')
  async publicRootDoc(
    @CurrentUser() user: CurrentUser | undefined,
    @Param('id') workspaceId: string,
    @Param('docId') docId: string,
    @Res() res: Response
  ) {
    await this.assertCanReadPublicDoc(
      user?.id ?? 'anonymous',
      workspaceId,
      docId
    );

    const rootDoc = await this.getDocBinaryOrThrow(workspaceId, workspaceId);

    const publicDocs = await this.models.doc.findPublics(workspaceId);
    const publicRootDoc = buildPublicRootDoc(
      Buffer.from(rootDoc.bin),
      publicDocs.map(doc => ({ id: doc.docId, title: doc.title ?? undefined }))
    );

    res.setHeader('content-type', 'application/octet-stream');
    res.send(publicRootDoc);
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

    await this.ac.user(user.id).doc(ws, guid).assert('Doc.Read');

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

  @Get('/:id/docs/:docId/comment-attachments/:key')
  @CallMetric('controllers', 'workspace_get_comment_attachment')
  async commentAttachment(
    @CurrentUser() user: CurrentUser,
    @Param('id') workspaceId: string,
    @Param('docId') docId: string,
    @Param('key') key: string,
    @Res() res: Response
  ) {
    await this.ac.user(user.id).doc(workspaceId, docId).assert('Doc.Read');

    const { body, metadata, redirectUrl } =
      await this.commentAttachmentStorage.get(workspaceId, docId, key, true);

    if (redirectUrl) {
      return res.redirect(redirectUrl);
    }

    if (!body) {
      throw new CommentAttachmentNotFound();
    }

    // metadata should always exists if body is not null
    if (metadata) {
      res.setHeader('content-type', metadata.contentType);
      res.setHeader('last-modified', metadata.lastModified.toUTCString());
      res.setHeader('content-length', metadata.contentLength);
    } else {
      this.logger.warn(
        `Comment attachment ${workspaceId}/${docId}/${key} has no metadata`
      );
    }
    applyAttachHeaders(res, {
      contentType: metadata?.contentType,
      filename: key,
    });

    res.setHeader('cache-control', 'private, max-age=2592000, immutable');
    body.pipe(res);
  }
}
