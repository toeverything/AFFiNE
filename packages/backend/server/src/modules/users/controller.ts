import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import { AvatarStorage } from '../storage';

@Controller('/api/avatars')
export class UserAvatarController {
  constructor(private readonly storage: AvatarStorage) {}

  @Get('/:id')
  async getAvatar(@Res() res: Response, @Param('id') id: string) {
    if (this.storage.provider.type !== 'fs') {
      throw new ForbiddenException(
        'Only available when avatar storage provider set to fs.'
      );
    }

    const { body, metadata } = await this.storage.get(id);

    if (!body) {
      throw new NotFoundException(`Avatar ${id} not found.`);
    }

    // metadata should always exists if body is not null
    if (metadata) {
      res.setHeader('content-type', metadata.contentType);
      res.setHeader('last-modified', metadata.lastModified.toISOString());
      res.setHeader('content-length', metadata.contentLength);
    }

    body.pipe(res);
  }
}
