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
import { ChatSessionService } from './session';
import { CopilotCapability } from './types';

export interface ChatEvent {
  data: string;
  id?: string;
}

@Controller('/api/copilot')
export class CopilotController {
  constructor(
    private readonly chatSession: ChatSessionService,
    private readonly provider: CopilotProviderService
  ) {}

  @Public()
  @Get('/chat/:sessionId')
  async chat(
    @CurrentUser() user: CurrentUser,
    @Req() req: Request,
    @Param('sessionId') sessionId: string,
    @Query('message') content: string,
    @Query() params: Record<string, string | string[]>
  ): Promise<string> {
    const provider = this.provider.getProviderByCapability(
      CopilotCapability.TextToText
    );
    if (!provider) {
      throw new InternalServerErrorException('No provider available');
    }
    const session = await this.chatSession.get(sessionId);
    if (!session) {
      throw new BadRequestException('Session not found');
    }
    if (!content || !content.trim()) {
      throw new BadRequestException('Message is empty');
    }
    session.push({
      role: 'user',
      content: decodeURIComponent(content),
      createdAt: new Date(),
    });

    try {
      delete params.message;
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
    @Query('message') content: string,
    @Query() params: Record<string, string>
  ): Promise<Observable<ChatEvent>> {
    const provider = this.provider.getProviderByCapability(
      CopilotCapability.TextToText
    );
    if (!provider) {
      throw new InternalServerErrorException('No provider available');
    }
    const session = await this.chatSession.get(sessionId);
    if (!session) {
      throw new BadRequestException('Session not found');
    }
    if (!content || !content.trim()) {
      throw new BadRequestException('Message is empty');
    }
    session.push({
      role: 'user',
      content: decodeURIComponent(content),
      createdAt: new Date(),
    });

    delete params.message;
    return from(
      provider.generateTextStream(session.finish(params), session.model, {
        signal: req.signal,
        user: user.id,
      })
    ).pipe(
      connect(shared$ =>
        merge(
          // actual chat event stream
          shared$.pipe(map(data => ({ id: sessionId, data }))),
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
}
