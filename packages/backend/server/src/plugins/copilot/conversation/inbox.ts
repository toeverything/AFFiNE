import { createHash } from 'node:crypto';

import { BadRequestException, Injectable } from '@nestjs/common';

import {
  type FileUpload,
  ImageFormatNotSupported,
  sniffMime,
} from '../../../base';
import { processImage } from '../../../native';
import { CopilotAccessService, type CopilotScopeMode } from '../access';
import { CompatSubmissionStore } from '../compat/submission-store';
import type { PromptMessage } from '../providers/types';
import type { ChatSessionService } from '../session';
import { CopilotStorage } from '../storage';

const COPILOT_IMAGE_MAX_EDGE = 1536;

type CreateInboxMessage = {
  sessionId: string;
  content?: string;
  attachments?: string[];
  blob?: Promise<FileUpload>;
  blobs?: Promise<FileUpload>[];
  params?: Record<string, any>;
};

@Injectable()
export class ConversationInboxService {
  constructor(
    private readonly access: CopilotAccessService,
    private readonly storage: CopilotStorage,
    private readonly submissions: CompatSubmissionStore
  ) {}

  async createMessage(
    userId: string,
    options: CreateInboxMessage,
    resolvedSession: NonNullable<
      Awaited<ReturnType<ChatSessionService['get']>>
    >,
    mode: CopilotScopeMode
  ): Promise<string> {
    const session = resolvedSession;

    const attachments: PromptMessage['attachments'] = options.attachments || [];
    const blobInputs = options.blob ? [options.blob] : options.blobs || [];

    const focusSelectors = options.params?.focusSelectors;
    const hasWorkspaceContext =
      attachments.length > 0 ||
      blobInputs.length > 0 ||
      (Array.isArray(options.params?.scopeSelectors) &&
        options.params.scopeSelectors.length > 0) ||
      (Array.isArray(options.params?.preferredSourceIds) &&
        options.params.preferredSourceIds.length > 0) ||
      (focusSelectors === undefined
        ? session.config.focus.selectors.length > 0
        : Array.isArray(focusSelectors) && focusSelectors.length > 0);
    if (hasWorkspaceContext && mode !== 'canonical') {
      throw new BadRequestException(
        "Local workspaces don't support attachments or references."
      );
    }

    const blobs = await Promise.all(blobInputs);

    for (const blob of blobs) {
      const uploaded = await this.storage.handleUpload(blob);
      const detectedMime =
        sniffMime(uploaded.buffer, blob.mimetype)?.toLowerCase() ||
        blob.mimetype;
      let attachmentBuffer = uploaded.buffer;
      let attachmentMimeType = detectedMime;

      if (detectedMime.startsWith('image/')) {
        try {
          attachmentBuffer = await processImage(
            uploaded.buffer,
            COPILOT_IMAGE_MAX_EDGE,
            true
          );
          attachmentMimeType = 'image/webp';
        } catch {
          throw new ImageFormatNotSupported({ format: detectedMime });
        }
      }

      const filename = createHash('sha256')
        .update(attachmentBuffer)
        .digest('base64url');
      const terminalMode = await this.access.sessionResource(
        {
          userId,
          workspaceId: session.config.workspaceId,
          docId: session.config.docId,
          action: session.config.docId ? 'Doc.Update' : 'Workspace.Copilot',
        },
        [options.sessionId]
      );
      if (terminalMode !== 'canonical') {
        throw new BadRequestException(
          "Local workspaces don't support attachments or references."
        );
      }
      await this.storage.putSessionAttachment(
        userId,
        session.config.workspaceId,
        filename,
        attachmentBuffer,
        attachmentMimeType
      );
      attachments.push({
        kind: 'url',
        url: this.storage.sessionAttachmentUrl(
          options.sessionId,
          session.config.workspaceId,
          filename,
          blob.filename
        ),
        mimeType: attachmentMimeType,
        fileName: blob.filename,
      });
    }

    return await this.submissions.create({
      userId,
      workspaceId: session.config.workspaceId,
      sessionId: options.sessionId,
      content: options.content,
      attachments,
      params: options.params,
    });
  }
}
