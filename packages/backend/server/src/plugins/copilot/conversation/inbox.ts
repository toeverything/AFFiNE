import { createHash } from 'node:crypto';

import { BadRequestException, Injectable } from '@nestjs/common';

import {
  type FileUpload,
  ImageFormatNotSupported,
  sniffMime,
} from '../../../base';
import { PermissionAccess } from '../../../core/permission';
import { Models } from '../../../models';
import { processImage } from '../../../native';
import { CompatSubmissionStore } from '../compat/submission-store';
import type { PromptMessage } from '../providers/types';
import { ChatSessionService } from '../session';
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
    private readonly chatSession: ChatSessionService,
    private readonly ac: PermissionAccess,
    private readonly models: Models,
    private readonly storage: CopilotStorage,
    private readonly submissions: CompatSubmissionStore
  ) {}

  async createMessage(
    userId: string,
    options: CreateInboxMessage
  ): Promise<string> {
    const session = await this.chatSession.get(options.sessionId);
    if (!session || session.config.userId !== userId) {
      throw new BadRequestException('Session not found');
    }

    const attachments: PromptMessage['attachments'] = options.attachments || [];
    const blobs = await Promise.all(
      options.blob ? [options.blob] : options.blobs || []
    );

    const focusSelectors = options.params?.focusSelectors;
    const hasWorkspaceContext =
      attachments.length > 0 ||
      blobs.length > 0 ||
      (Array.isArray(options.params?.scopeSelectors) &&
        options.params.scopeSelectors.length > 0) ||
      (Array.isArray(options.params?.preferredSourceIds) &&
        options.params.preferredSourceIds.length > 0) ||
      (focusSelectors === undefined
        ? session.config.focus.selectors.length > 0
        : Array.isArray(focusSelectors) && focusSelectors.length > 0);
    if (
      hasWorkspaceContext &&
      !(await this.models.workspace.get(session.config.workspaceId))
    ) {
      throw new BadRequestException(
        "Local workspaces don't support attachments or references."
      );
    }

    if (blobs.length) {
      await this.ac
        .user(userId)
        .workspace(session.config.workspaceId)
        .allowLocal()
        .assert('Workspace.Blobs.Write');
    }

    for (const blob of blobs) {
      const uploaded = await this.storage.handleUpload(userId, blob);
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
      const attachment = await this.storage.put(
        userId,
        session.config.workspaceId,
        filename,
        attachmentBuffer
      );
      attachments.push({
        kind: 'url',
        url: attachment,
        mimeType: attachmentMimeType,
        fileName: blob.filename,
      });
    }

    return await this.submissions.create({
      sessionId: options.sessionId,
      content: options.content,
      attachments,
      params: options.params,
    });
  }
}
