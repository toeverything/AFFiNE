import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

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
  BadRequest,
  CallMetric,
  CommentAttachmentNotFound,
  DocActionDenied,
  DocHistoryNotFound,
  DocNotFound,
  getRequestTrackerId,
  InvalidHistoryTimestamp,
  UnsupportedClientVersion,
} from '../../base';
import { DocMode, Models, PublicDocMode } from '../../models';
import { buildPublicRootDoc, canonicalizeDocumentIdentity } from '../../native';
import { CurrentUser, Public } from '../auth';
import { BackendRuntimeProvider, type BlobSourceV1 } from '../backend-runtime';
import { PgWorkspaceDocStorageAdapter } from '../doc';
import { DocReader } from '../doc/reader';
import { PermissionAccess } from '../permission';
import { CommentAttachmentStorage } from '../storage';

@Controller('/api/workspaces')
export class WorkspacesController {
  logger = new Logger(WorkspacesController.name);
  constructor(
    private readonly commentAttachmentStorage: CommentAttachmentStorage,
    private readonly ac: PermissionAccess,
    private readonly workspace: PgWorkspaceDocStorageAdapter,
    private readonly docReader: DocReader,
    private readonly models: Models,
    private readonly runtime: BackendRuntimeProvider
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

  @Public()
  @Get('/:id/blob-manifest/v1')
  async blobManifestV1(
    @CurrentUser() user: CurrentUser | undefined,
    @Param('id') workspaceId: string,
    @Query('sourceType') sourceType: string,
    @Query('docId') docId: string,
    @Query('timestampMs') timestampMs: string | undefined,
    @Res() res: Response
  ) {
    const source = this.blobSource(workspaceId, sourceType, docId, timestampMs);
    const manifest = await this.runtime.getDocBlobManifestV1(user?.id, source);
    res.setHeader('cache-control', 'private, no-store');
    return res.json(manifest);
  }

  @Get('/:id/readable-blob-manifest/v1')
  async readableBlobManifestV1(
    @CurrentUser() user: CurrentUser,
    @Param('id') workspaceId: string,
    @Query('cursor') cursor: string | undefined,
    @Query('limit') rawLimit: string | undefined,
    @Res() res: Response
  ) {
    const limit = rawLimit === undefined ? undefined : Number(rawLimit);
    const manifest = await this.runtime.getReadableWorkspaceBlobManifestV1({
      actorUserId: user.id,
      workspaceId,
      cursor,
      limit: Number.isInteger(limit) ? limit : undefined,
    });
    res.setHeader('cache-control', 'private, no-store');
    return res.json(manifest);
  }

  @Public()
  @Get('/:id/blobs/v1/:name')
  @CallMetric('controllers', 'workspace_get_blob_v1')
  async blobV1(
    @CurrentUser() user: CurrentUser | undefined,
    @Param('id') workspaceId: string,
    @Param('name') name: string,
    @Query('sourceType') sourceType: string,
    @Query('docId') docId: string,
    @Query('timestampMs') timestampMs: string | undefined,
    @Res() res: Response
  ) {
    const source = this.blobSource(workspaceId, sourceType, docId, timestampMs);
    const blob = await this.runtime.openBlobV1(user?.id, source, name);
    res.setHeader('content-type', blob.mime);
    res.setHeader('content-length', blob.size);
    res.setHeader('last-modified', new Date(blob.lastModifiedMs).toUTCString());
    res.setHeader('cache-control', 'private, no-store');
    applyAttachHeaders(res, { contentType: blob.mime, filename: name });
    const body = Readable.from(
      (async function* (runtime: BackendRuntimeProvider) {
        while (true) {
          const chunk = await runtime.readBlobStreamChunkV1(blob.streamId);
          if (chunk.body.length) yield chunk.body;
          if (chunk.done) return;
        }
      })(this.runtime)
    );
    try {
      await pipeline(body, res);
    } finally {
      await this.runtime.closeBlobStreamV1(blob.streamId);
    }
  }

  @Public()
  @Get('/:id/blobs/:name')
  @CallMetric('controllers', 'workspace_get_blob')
  async blob(@Req() req: Request) {
    const clientVersion = req.header('x-affine-version');
    throw new UnsupportedClientVersion({
      clientVersion: clientVersion ?? 'unset_or_invalid',
      requiredVersion: '>=0.27.0 (source-scoped blob protocol)',
    });
  }

  private blobSource(
    workspaceId: string,
    sourceType: string,
    docId: string,
    rawTimestamp: string | undefined
  ): BlobSourceV1 {
    if (sourceType === 'currentDoc' && docId) {
      const identity = canonicalizeDocumentIdentity(docId, workspaceId);
      return {
        type: 'currentDoc',
        workspaceId: identity.workspaceId,
        docId: identity.docId,
      };
    }
    if (sourceType !== 'history' || !docId) {
      throw new BadRequest('Invalid blob source');
    }
    const timestampMs = Number(rawTimestamp);
    if (Number.isSafeInteger(timestampMs)) {
      const identity = canonicalizeDocumentIdentity(docId, workspaceId);
      return {
        type: 'history',
        workspaceId: identity.workspaceId,
        docId: identity.docId,
        timestampMs,
      };
    }
    throw new InvalidHistoryTimestamp({ timestamp: rawTimestamp ?? '' });
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
    const docId = canonicalizeDocumentIdentity(guid, ws);
    if (docId.isWorkspace) {
      await this.ac
        .user(user?.id ?? 'anonymous')
        .workspace(ws)
        .assert('Workspace.Read');
    } else {
      await this.ac
        .user(user?.id ?? 'anonymous')
        .doc(docId.workspaceId, docId.docId)
        .assert('Doc.Read');
    }
    const binResponse = await this.docReader.getDoc(
      docId.workspaceId,
      docId.docId
    );

    if (!binResponse) {
      throw new DocNotFound({
        spaceId: docId.workspaceId,
        docId: docId.docId,
      });
    }

    if (!docId.isWorkspace) {
      void this.models.workspaceAnalytics
        .recordDocView({
          workspaceId: docId.workspaceId,
          docId: docId.docId,
          userId: user?.id,
          visitorId: this.buildVisitorId(req, docId.workspaceId, docId.docId),
          isGuest: !user,
        })
        .catch(error => {
          this.logger.warn(
            `Failed to record doc view: ${docId.workspaceId}/${docId.docId}`,
            error as Error
          );
        });
    }

    if (!docId.isWorkspace) {
      // fetch the publish page mode for publish page
      const docMeta = await this.models.doc.getMeta(
        docId.workspaceId,
        docId.docId,
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
    const docId = canonicalizeDocumentIdentity(guid, ws);
    const ts = new Date(timestamp);
    if (Number.isNaN(ts.getTime())) {
      throw new InvalidHistoryTimestamp({ timestamp });
    }
    const permission = await this.runtime.authorizePermissionV1({
      version: 1,
      workspaceId: docId.workspaceId,
      actorUserId: user.id,
      workspaceActions: ['Workspace.Sync'],
      docs: [{ docId: docId.docId, actions: ['Doc.Read', 'Doc.History.Read'] }],
    });
    if (
      !permission.workspace.decisions[0]?.allowed ||
      permission.docs[0]?.decisions.length !== 2 ||
      !permission.docs[0].decisions.every(decision => decision.allowed)
    ) {
      throw new DocActionDenied({
        docId: docId.docId,
        spaceId: docId.workspaceId,
        action: 'Doc.History.Read',
      });
    }

    const history = await this.workspace.getDocHistory(
      docId.workspaceId,
      docId.docId,
      ts.getTime()
    );

    if (history) {
      res.setHeader('content-type', 'application/octet-stream');
      res.setHeader('cache-control', 'private, no-store');
      res.send(history.bin);
    } else {
      throw new DocHistoryNotFound({
        spaceId: docId.workspaceId,
        docId: docId.docId,
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

    const { body, metadata } = await this.commentAttachmentStorage.get({
      workspaceId,
      docId,
      key,
    });

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

    res.setHeader('cache-control', 'private, no-store');
    body.pipe(res);
  }
}
