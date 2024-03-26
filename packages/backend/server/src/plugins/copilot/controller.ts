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
import { ProviderService } from './providers';
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
    private readonly provider: ProviderService
  ) {}

  @Public()
  @Get('/chat/:sessionId')
  async chat(
    @CurrentUser() user: CurrentUser | undefined,
    @Req() req: Request,
    @Param('sessionId') sessionId: string,
    @Query('message') content: string
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
    session.push({ role: 'user', content: decodeURIComponent(content) });

    try {
      const content = await provider.generateText(
        session.finish(),
        session.model,
        {
          signal: req.signal,
          user: user?.id,
        }
      );

      session.push({ role: 'assistant', content });
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
    @CurrentUser() user: CurrentUser | undefined,
    @Req() req: Request,
    @Param('sessionId') sessionId: string,
    @Query('message') content: string
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
    session.push({ role: 'user', content: decodeURIComponent(content) });

    return from(
      provider.generateTextStream(session.finish(), session.model, {
        signal: req.signal,
        user: user?.id,
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
              session.push({ role: 'assistant', content: values.join('') });
              return from(session.save());
            }),
            switchMap(() => EMPTY)
          )
        )
      )
    );
  }
}
