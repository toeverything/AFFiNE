import {
  BadRequestException,
  Controller,
  Get,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  Param,
  Query,
  Req,
  Res,
  Sse,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  concatMap,
  connect,
  EMPTY,
  from,
  map,
  merge,
  mergeMap,
  Observable,
  switchMap,
  toArray,
} from 'rxjs';

import { Public } from '../../core/auth';
import { CurrentUser } from '../../core/auth/current-user';
import { Config } from '../../fundamentals';
import { CopilotProviderService } from './providers';
import { ChatSession, ChatSessionService } from './session';
import { CopilotStorage } from './storage';
import { CopilotCapability } from './types';

export interface ChatEvent {
  type: 'attachment' | 'message';
  id?: string;
  data: string;
}

@Controller('/api/copilot')
export class CopilotController {
  private readonly logger = new Logger(CopilotController.name);

  constructor(
    private readonly config: Config,
    private readonly chatSession: ChatSessionService,
    private readonly provider: CopilotProviderService,
    private readonly storage: CopilotStorage
  ) {}

  private async hasAttachment(sessionId: string, messageId: string) {
    const session = await this.chatSession.get(sessionId);
    if (!session) {
      throw new BadRequestException('Session not found');
    }

    const message = await session.getMessageById(messageId);
    if (Array.isArray(message.attachments) && message.attachments.length) {
      return true;
    }
    return false;
  }

  private async appendSessionMessage(
    sessionId: string,
    messageId: string
  ): Promise<ChatSession> {
    const session = await this.chatSession.get(sessionId);
    if (!session) {
      throw new BadRequestException('Session not found');
    }

    await session.pushByMessageId(messageId);

    return session;
  }

  private getSignal(req: Request) {
    const controller = new AbortController();
    req.on('close', () => controller.abort());
    return controller.signal;
  }

  @Get('/chat/:sessionId')
  async chat(
    @CurrentUser() user: CurrentUser,
    @Req() req: Request,
    @Param('sessionId') sessionId: string,
    @Query('messageId') messageId: string,
    @Query() params: Record<string, string | string[]>
  ): Promise<string> {
    await this.chatSession.checkQuota(user.id);

    const model = await this.chatSession.get(sessionId).then(s => s?.model);
    const provider = this.provider.getProviderByCapability(
      CopilotCapability.TextToText,
      model
    );
    if (!provider) {
      throw new InternalServerErrorException('No provider available');
    }

    const session = await this.appendSessionMessage(sessionId, messageId);

    try {
      delete params.messageId;
      const content = await provider.generateText(
        session.finish(params),
        session.model,
        {
          signal: this.getSignal(req),
          user: user.id,
        }
      );

      session.push({
        role: 'assistant',
        content,
        createdAt: new Date(),
      });
      await session.save();

      return content;
    } catch (e: any) {
      throw new InternalServerErrorException(
        e.message || "Couldn't generate text"
      );
    }
  }

  @Sse('/chat/:sessionId/stream')
  async chatStream(
    @CurrentUser() user: CurrentUser,
    @Req() req: Request,
    @Param('sessionId') sessionId: string,
    @Query('messageId') messageId: string,
    @Query() params: Record<string, string>
  ): Promise<Observable<ChatEvent>> {
    await this.chatSession.checkQuota(user.id);

    const model = await this.chatSession.get(sessionId).then(s => s?.model);
    const provider = this.provider.getProviderByCapability(
      CopilotCapability.TextToText,
      model
    );
    if (!provider) {
      throw new InternalServerErrorException('No provider available');
    }

    const session = await this.appendSessionMessage(sessionId, messageId);
    delete params.messageId;

    return from(
      provider.generateTextStream(session.finish(params), session.model, {
        signal: this.getSignal(req),
        user: user.id,
      })
    ).pipe(
      connect(shared$ =>
        merge(
          // actual chat event stream
          shared$.pipe(
            map(data => ({ type: 'message' as const, id: sessionId, data }))
          ),
          // save the generated text to the session
          shared$.pipe(
            toArray(),
            concatMap(values => {
              session.push({
                role: 'assistant',
                content: values.join(''),
                createdAt: new Date(),
              });
              return from(session.save());
            }),
            switchMap(() => EMPTY)
          )
        )
      )
    );
  }

  @Sse('/chat/:sessionId/images')
  async chatImagesStream(
    @CurrentUser() user: CurrentUser,
    @Req() req: Request,
    @Param('sessionId') sessionId: string,
    @Query('messageId') messageId: string,
    @Query() params: Record<string, string>
  ): Promise<Observable<ChatEvent>> {
    await this.chatSession.checkQuota(user.id);

    const hasAttachment = await this.hasAttachment(sessionId, messageId);
    const model = await this.chatSession.get(sessionId).then(s => s?.model);
    const provider = this.provider.getProviderByCapability(
      hasAttachment
        ? CopilotCapability.ImageToImage
        : CopilotCapability.TextToImage,
      model
    );
    if (!provider) {
      throw new InternalServerErrorException('No provider available');
    }

    const session = await this.appendSessionMessage(sessionId, messageId);
    delete params.messageId;

    const handleRemoteLink = this.storage.handleRemoteLink.bind(
      this.storage,
      user.id,
      sessionId
    );

    return from(
      provider.generateImagesStream(session.finish(params), session.model, {
        signal: this.getSignal(req),
        user: user.id,
      })
    ).pipe(
      mergeMap(handleRemoteLink),
      connect(shared$ =>
        merge(
          // actual chat event stream
          shared$.pipe(
            map(attachment => ({
              type: 'attachment' as const,
              id: sessionId,
              data: attachment,
            }))
          ),
          // save the generated text to the session
          shared$.pipe(
            toArray(),
            concatMap(attachments => {
              session.push({
                role: 'assistant',
                content: '',
                attachments: attachments,
                createdAt: new Date(),
              });
              return from(session.save());
            }),
            switchMap(() => EMPTY)
          )
        )
      )
    );
  }

  @Get('/unsplash/photos')
  async unsplashPhotos(
    @Req() req: Request,
    @Res() res: Response,
    @Query() params: Record<string, string>
  ) {
    const { unsplashKey } = this.config.plugins.copilot || {};
    if (!unsplashKey) {
      throw new InternalServerErrorException('Unsplash key is not configured');
    }

    const query = new URLSearchParams(params);
    const response = await fetch(
      `https://api.unsplash.com/search/photos?${query}`,
      {
        headers: { Authorization: `Client-ID ${unsplashKey}` },
        signal: this.getSignal(req),
      }
    );

    res.set({
      'Content-Type': response.headers.get('Content-Type'),
      'Content-Length': response.headers.get('Content-Length'),
      'X-Ratelimit-Limit': response.headers.get('X-Ratelimit-Limit'),
      'X-Ratelimit-Remaining': response.headers.get('X-Ratelimit-Remaining'),
    });

    res.status(response.status).send(await response.json());
  }

  @Public()
  @Get('/blob/:userId/:workspaceId/:key')
  async getBlob(
    @Res() res: Response,
    @Param('userId') userId: string,
    @Param('workspaceId') workspaceId: string,
    @Param('key') key: string
  ) {
    const { body, metadata } = await this.storage.get(userId, workspaceId, key);

    if (!body) {
      throw new NotFoundException(
        `Blob not found in ${userId}'s workspace ${workspaceId}: ${key}`
      );
    }

    // metadata should always exists if body is not null
    if (metadata) {
      res.setHeader('content-type', metadata.contentType);
      res.setHeader('last-modified', metadata.lastModified.toUTCString());
      res.setHeader('content-length', metadata.contentLength);
    } else {
      this.logger.warn(`Blob ${workspaceId}/${key} has no metadata`);
    }

    res.setHeader('cache-control', 'public, max-age=2592000, immutable');
    body.pipe(res);
  }
}
