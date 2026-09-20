import { createHash } from 'node:crypto';

import { BadRequestException, Injectable } from '@nestjs/common';

import type { LlmImageResponse } from '../../../../native';
import type { CopilotScopeMode } from '../../access';
import { CopilotStorage } from '../../storage';

@Injectable()
export class ImageResultHost {
  constructor(private readonly storage: CopilotStorage) {}

  private async persistRemoteLink(
    userId: string,
    workspaceId: string,
    link: string
  ) {
    return await this.storage.handleRemoteLink(userId, workspaceId, link);
  }

  async persistNativeArtifact(
    userId: string,
    workspaceId: string,
    artifact: LlmImageResponse['images'][number] & { mimeType?: string },
    scopeMode: CopilotScopeMode
  ) {
    if (scopeMode !== 'canonical') {
      throw new BadRequestException(
        "Local workspaces don't support generated images."
      );
    }
    if (artifact.data_base64) {
      const buffer = Buffer.from(artifact.data_base64, 'base64');
      const filename = cryptoHash(buffer);
      const mediaType = artifact.media_type ?? artifact.mimeType;
      if (!mediaType) {
        return null;
      }
      return await this.storage.put(
        userId,
        workspaceId,
        filename,
        buffer,
        mediaType
      );
    }
    if (artifact.url) {
      return await this.persistRemoteLink(userId, workspaceId, artifact.url);
    }
    return null;
  }
}

function cryptoHash(buffer: Buffer) {
  return createHash('sha256').update(buffer).digest('base64url');
}
