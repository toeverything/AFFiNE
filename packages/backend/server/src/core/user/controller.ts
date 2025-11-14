import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';

import {
  ActionForbidden,
  applyAttachHeaders,
  UserAvatarNotFound,
} from '../../base';
import { Public } from '../auth/guard';
import { AvatarStorage } from '../storage';

@Public()
@Controller('/api/avatars')
export class UserAvatarController {
  constructor(private readonly storage: AvatarStorage) {}

  @Get('/:id')
  async getAvatar(@Res() res: Response, @Param('id') id: string) {
    if (this.storage.config.storage.provider !== 'fs') {
      throw new ActionForbidden(
        'Only available when avatar storage provider set to fs.'
      );
    }

    const { body, metadata } = await this.storage.get(id);

    if (!body) {
      throw new UserAvatarNotFound();
    }

    // metadata should always exists if body is not null
    if (metadata) {
      res.setHeader('content-type', metadata.contentType);
      res.setHeader('last-modified', metadata.lastModified.toISOString());
      res.setHeader('content-length', metadata.contentLength);
    }
    applyAttachHeaders(res, {
      contentType: metadata?.contentType,
      filename: `${id}`,
    });

    body.pipe(res);
  }
}
