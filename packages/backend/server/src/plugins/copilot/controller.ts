import {
  BadRequestException,
  Controller,
  Get,
  InternalServerErrorException,
  Param,
  Query,
  Req,
  Sse,
} from '@nestjs/common';
import {
  concatMap,
  connect,
  EMPTY,
  from,
  map,
  merge,
  Observable,
  switchMap,
  toArray,
} from 'rxjs';

import { Public } from '../../core/auth';
import { CurrentUser } from '../../core/auth/current-user';
import { CopilotProviderService } from './providers';
import { ChatSession, ChatSessionService } from './session';
import { CopilotCapability } from './types';

export interface ChatEvent {
  type: 'attachment' | 'message';
  id?: string;
  data: string;
}

@Controller('/api/copilot')
export class CopilotController {
  constructor(
    private readonly chatSession: ChatSessionService,
    private readonly provider: CopilotProviderService
  ) {}

  private async hasAttachment(sessionId: string, messageId?: string) {
    const session = await this.chatSession.get(sessionId);
    if (!session) {
      throw new BadRequestException('Session not found');
    }

    if (messageId) {
      const message = await session.getMessageById(messageId);
      if (Array.isArray(message.attachments) && message.attachments.length) {
        return true;
      }
    }
    return false;
  }

  private async appendSessionMessage(
    sessionId: string,
    message?: string,
    messageId?: string
  ): Promise<ChatSession> {
    const session = await this.chatSession.get(sessionId);
    if (!session) {
      throw new BadRequestException('Session not found');
    }

    if (messageId) {
      await session.pushByMessageId(messageId);
    } else {
      if (!message || !message.trim()) {
        throw new BadRequestException('Message is empty');
      }
      session.push({
        role: 'user',
        content: decodeURIComponent(message),
        createdAt: new Date(),
      });
    }
    return session;
  }

  @Public()
  @Get('/chat/:sessionId')
  async chat(
    @CurrentUser() user: CurrentUser,
    @Req() req: Request,
    @Param('sessionId') sessionId: string,
    @Query('message') message: string | undefined,
    @Query('messageId') messageId: string | undefined,
    @Query() params: Record<string, string | string[]>
  ): Promise<string> {
    const model = await this.chatSession.get(sessionId).then(s => s?.model);
    const provider = this.provider.getProviderByCapability(
      CopilotCapability.TextToText,
      model
    );
    if (!provider) {
      throw new InternalServerErrorException('No provider available');
    }

    const session = await this.appendSessionMessage(
      sessionId,
      message,
      messageId
    );

    try {
      delete params.message;
      delete params.messageId;
      const content = await provider.generateText(
        session.finish(params),
        session.model,
        {
          signal: req.signal,
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

  @Public()
  @Sse('/chat/:sessionId/stream')
  async chatStream(
    @CurrentUser() user: CurrentUser,
    @Req() req: Request,
    @Param('sessionId') sessionId: string,
    @Query('message') message: string | undefined,
    @Query('messageId') messageId: string | undefined,
    @Query() params: Record<string, string>
  ): Promise<Observable<ChatEvent>> {
    const model = await this.chatSession.get(sessionId).then(s => s?.model);
    const provider = this.provider.getProviderByCapability(
      CopilotCapability.TextToText,
      model
    );
    if (!provider) {
      throw new InternalServerErrorException('No provider available');
    }

    const session = await this.appendSessionMessage(
      sessionId,
      message,
      messageId
    );

    delete params.message;
    delete params.messageId;
    return from(
      provider.generateTextStream(session.finish(params), session.model, {
        signal: req.signal,
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

  @Public()
  @Sse('/chat/:sessionId/images')
  async chatImagesStream(
    @CurrentUser() user: CurrentUser | undefined,
    @Req() req: Request,
    @Param('sessionId') sessionId: string,
    @Query('message') message: string | undefined,
    @Query('messageId') messageId: string | undefined,
    @Query() params: Record<string, string>
  ): Promise<Observable<ChatEvent>> {
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

    const session = await this.appendSessionMessage(
      sessionId,
      message,
      messageId
    );

    delete params.message;
    delete params.messageId;
    return from(
      provider.generateImagesStream(session.finish(params), session.model, {
        signal: req.signal,
        user: user?.id,
      })
    ).pipe(
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
}
