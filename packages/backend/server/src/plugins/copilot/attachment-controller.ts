import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';

import type { RawBodyRequest } from '@nestjs/common';
import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import {
  applyAttachHeaders,
  BadRequest,
  CallMetric,
  sniffMime,
} from '../../base';
import { CurrentUser } from '../../core/auth';
import { CopilotAccessService } from './access';
import { CopilotEnabled } from './feature';
import { ChatSessionService } from './session';
import { CopilotStorage } from './storage';

@CopilotEnabled()
@Controller('/api/copilot')
export class CopilotAttachmentController {
  constructor(
    private readonly sessions: ChatSessionService,
    private readonly access: CopilotAccessService,
    private readonly storage: CopilotStorage
  ) {}

  private async assertCanonicalSession(
    userId: string,
    sessionId: string,
    workspaceId: string
  ) {
    const scope = await this.sessions.getOwnedScope(sessionId, userId);
    if (!scope || scope.workspaceId !== workspaceId) {
      throw new NotFoundException('Copilot session not found');
    }
    const mode = await this.access.sessionResource(
      {
        userId,
        workspaceId,
        docId: scope.docId,
        action: scope.docId ? 'Doc.Update' : 'Workspace.Copilot',
      },
      [sessionId]
    );
    if (mode !== 'canonical') {
      throw new BadRequest(
        "Local workspaces don't support attachments or references."
      );
    }
    const session = await this.sessions.getInScope({
      sessionId,
      userId,
      workspaceId,
      personal: false,
    });
    if (!session) {
      throw new NotFoundException('Copilot session not found');
    }
  }

  @Put('/chat/:sessionId/attachments/:key')
  @CallMetric('ai', 'session_attachment_upload')
  async upload(
    @CurrentUser() user: CurrentUser,
    @Param('sessionId') sessionId: string,
    @Param('key') key: string,
    @Query('workspaceId') workspaceId: string,
    @Query('mimeType') declaredMimeType: string | undefined,
    @Query('fileName') fileName: string | undefined,
    @Req() req: RawBodyRequest<Request>
  ) {
    await this.assertCanonicalSession(user.id, sessionId, workspaceId);
    const buffer = req.rawBody;
    if (!buffer?.length) {
      throw new BadRequest('Copilot attachment body is required');
    }
    const expectedKey = createHash('sha256').update(buffer).digest('base64url');
    if (key !== expectedKey) {
      throw new BadRequest('Copilot attachment checksum mismatch');
    }
    await this.storage.handleUploadBuffer(buffer);
    await this.assertCanonicalSession(user.id, sessionId, workspaceId);
    const mimeType = sniffMime(buffer, declaredMimeType)?.toLowerCase();
    await this.storage.putSessionAttachment(
      user.id,
      workspaceId,
      key,
      buffer,
      mimeType || 'application/octet-stream'
    );
    return {
      url: this.storage.sessionAttachmentUrl(
        sessionId,
        workspaceId,
        key,
        fileName
      ),
    };
  }

  @Get('/chat/:sessionId/attachments/:key')
  @CallMetric('ai', 'session_attachment_download')
  async download(
    @CurrentUser() user: CurrentUser,
    @Param('sessionId') sessionId: string,
    @Param('key') key: string,
    @Query('workspaceId') workspaceId: string,
    @Query('fileName') fileName: string | undefined,
    @Res() res: Response
  ) {
    await this.assertCanonicalSession(user.id, sessionId, workspaceId);
    const object = await this.storage.getSessionAttachment(
      user.id,
      workspaceId,
      key
    );
    if (!object.body || !object.metadata) {
      throw new NotFoundException('Copilot attachment not found');
    }
    res.setHeader('cache-control', 'private, no-store');
    res.setHeader('content-length', object.metadata.contentLength);
    applyAttachHeaders(res, {
      contentType: object.metadata.contentType,
      filename: fileName,
    });
    await pipeline(object.body, res);
  }
}
