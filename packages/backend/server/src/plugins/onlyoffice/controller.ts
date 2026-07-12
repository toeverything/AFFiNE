import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import { BadRequest, BlobNotFound } from '../../base';
import { CurrentUser, Public } from '../../core/auth';
import { PermissionAccess } from '../../core/permission';
import { OnlyOfficeService } from './service';
import { isOnlyOfficeMode, type OnlyOfficeCallbackBody } from './types';

@Controller('/api/workspaces')
export class OnlyOfficeController {
  constructor(
    private readonly service: OnlyOfficeService,
    private readonly ac: PermissionAccess
  ) {}

  /**
   * Return a signed OnlyOffice editor config for a workspace blob.
   * Requires the current user to be able to read the workspace; edit mode is
   * granted only when the user can also update the workspace content.
   */
  @Get('/:id/onlyoffice/config/:name')
  async getConfig(
    @CurrentUser() user: CurrentUser,
    @Param('id') workspaceId: string,
    @Param('name') blobId: string,
    @Query('filename') filename: string | undefined,
    @Query('lang') lang: string | undefined,
    @Query('mode') mode: string | undefined,
    @Query('docId') docId: string | undefined,
    @Query('blockId') blockId: string | undefined
  ) {
    const canRead = await this.ac
      .user(user.id)
      .workspace(workspaceId)
      .can('Workspace.Blobs.Read');
    if (!canRead) {
      throw new BadRequest('No permission to read this workspace.');
    }

    const canWrite = await this.ac
      .user(user.id)
      .workspace(workspaceId)
      .can('Workspace.Blobs.Write');

    return this.service.buildEditorConfig({
      workspaceId,
      blobId,
      name: filename || blobId,
      canWrite,
      mode: isOnlyOfficeMode(mode) ? mode : 'edit',
      docId,
      blockId,
      user: { id: user.id, name: user.name },
      lang,
    });
  }

  /**
   * Standalone OnlyOffice editor page (opened in its own window/tab). Public
   * HTML shell — the config fetch inside it is authenticated by the session
   * cookie (same-origin). Decoupled from the AFFiNE frontend framework.
   */
  @Public()
  @Get('/:id/onlyoffice/editor/:name')
  async editorPage(
    @Param('id') workspaceId: string,
    @Param('name') blobId: string,
    @Query('filename') filename: string | undefined,
    @Query('lang') lang: string | undefined,
    @Query('mode') mode: string | undefined,
    @Query('docId') docId: string | undefined,
    @Query('blockId') blockId: string | undefined,
    @Res() res: Response
  ) {
    const html = this.service.buildEditorPage({
      workspaceId,
      blobId,
      filename: filename || blobId,
      lang,
      mode: isOnlyOfficeMode(mode) ? mode : 'edit',
      docId,
      blockId,
    });
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.send(html);
  }

  /**
   * Public, token-authenticated blob download for the Document Server.
   * The Document Server fetches `document.url` server-side without a user
   * session, so we authorize it with the signed file token instead.
   */
  @Public()
  @Get('/:id/onlyoffice/download/:name')
  async download(
    @Param('id') workspaceId: string,
    @Param('name') blobId: string,
    @Query('token') token: string | undefined,
    @Res() res: Response
  ) {
    this.service.verifyFileToken(token, workspaceId, blobId);

    const { body, metadata } = await this.service.getBlob(workspaceId, blobId);
    if (!body) {
      throw new BlobNotFound({ spaceId: workspaceId, blobId });
    }

    if (metadata) {
      res.setHeader('content-type', metadata.contentType);
      res.setHeader('content-length', metadata.contentLength);
    }
    body.pipe(res);
  }

  /**
   * Trigger a force-save on the Document Server so the edited content is
   * flushed to a new blob while the editor window is still open. Auth'd by the
   * user session (called from the editor page with the document key).
   */
  @Post('/:id/onlyoffice/forcesave/:name')
  async forcesave(
    @CurrentUser() user: CurrentUser,
    @Param('id') workspaceId: string,
    @Query('key') docKey: string | undefined
  ) {
    const canWrite = await this.ac
      .user(user.id)
      .workspace(workspaceId)
      .can('Workspace.Blobs.Write');
    if (!canWrite) {
      throw new BadRequest('No permission to edit this workspace.');
    }
    if (!docKey) {
      throw new BadRequest('Missing document key.');
    }
    await this.service.forceSave(docKey);
    return { ok: true };
  }

  /**
   * List stored versions for an attachment instance (docId + blockId).
   * Auth'd by the user session; requires blob read permission.
   */
  @Get('/:id/onlyoffice/versions/:name')
  async versions(
    @CurrentUser() user: CurrentUser,
    @Param('id') workspaceId: string,
    @Query('docId') docId: string | undefined,
    @Query('blockId') blockId: string | undefined
  ) {
    const canRead = await this.ac
      .user(user.id)
      .workspace(workspaceId)
      .can('Workspace.Blobs.Read');
    if (!canRead) {
      throw new BadRequest('No permission to read this workspace.');
    }
    if (!docId || !blockId) {
      throw new BadRequest('Missing docId/blockId.');
    }
    const canWrite = await this.ac
      .user(user.id)
      .workspace(workspaceId)
      .can('Workspace.Blobs.Write');
    const versions = await this.service.listVersions(
      workspaceId,
      docId,
      blockId
    );
    return { versions, canWrite };
  }

  /**
   * Remove a specific version from an attachment's history. Requires write
   * permission. The service validates the blob belongs to this attachment's
   * manifest before doing anything.
   */
  @Post('/:id/onlyoffice/delete-version/:name')
  async deleteVersion(
    @CurrentUser() user: CurrentUser,
    @Param('id') workspaceId: string,
    @Param('name') blobId: string,
    @Query('docId') docId: string | undefined,
    @Query('blockId') blockId: string | undefined
  ) {
    const canWrite = await this.ac
      .user(user.id)
      .workspace(workspaceId)
      .can('Workspace.Blobs.Write');
    if (!canWrite) {
      throw new BadRequest('No permission to edit this workspace.');
    }
    if (!docId || !blockId) {
      throw new BadRequest('Missing docId/blockId.');
    }
    await this.service.deleteVersion(workspaceId, docId, blockId, blobId);
    return { ok: true };
  }

  /**
   * Poll for the result of a save: returns the new content-addressed blob id
   * and size once the callback has produced it. Auth'd by the user session.
   */
  @Get('/:id/onlyoffice/result/:name')
  async result(
    @CurrentUser() user: CurrentUser,
    @Param('id') workspaceId: string,
    @Query('key') docKey: string | undefined
  ) {
    const canRead = await this.ac
      .user(user.id)
      .workspace(workspaceId)
      .can('Workspace.Blobs.Read');
    if (!canRead) {
      throw new BadRequest('No permission to read this workspace.');
    }
    if (!docKey) {
      throw new BadRequest('Missing document key.');
    }
    const result = await this.service.getSaveResult(workspaceId, docKey);
    return result ?? { blobId: null, size: null };
  }

  /**
   * OnlyOffice Document Server callback. Public route, but every request is
   * authenticated via the shared JWT secret. Must always respond with
   * `{ error: 0 }` on success per the OnlyOffice protocol.
   */
  @Public()
  @Post('/:id/onlyoffice/callback/:name')
  @HttpCode(200)
  async callback(
    @Param('id') workspaceId: string,
    @Param('name') blobId: string,
    @Query('docId') docId: string | undefined,
    @Query('blockId') blockId: string | undefined,
    @Headers('authorization') authorization: string | undefined,
    @Body() body: OnlyOfficeCallbackBody
  ) {
    const payload = this.service.verifyCallback(authorization, body);
    await this.service.applyCallback(workspaceId, blobId, payload, {
      docId,
      blockId,
    });
    // OnlyOffice expects this exact response shape.
    return { error: 0 };
  }
}
