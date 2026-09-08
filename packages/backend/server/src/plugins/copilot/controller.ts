import {
  BeforeApplicationShutdown,
  Controller,
  Get,
  Param,
  Query,
  Req,
  Res,
  Sse,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  BehaviorSubject,
  catchError,
  filter,
  finalize,
  from,
  interval,
  lastValueFrom,
  map,
  merge,
  Observable,
  Subject,
  take,
  takeUntil,
} from 'rxjs';

import {
  CallMetric,
  Config,
  mapSseError,
  metrics,
  UnsplashIsNotConfigured,
} from '../../base';
import { CurrentUser } from '../../core/auth';
import { CopilotEnabled } from './feature';
import {
  ActionStreamHost,
  projectActionEventToChatEvent,
} from './runtime/hosts/action-stream-host';
import { TurnOrchestrator } from './runtime/turn-orchestrator';
import { getSignal } from './utils';

export interface ChatEvent {
  type: 'event' | 'attachment' | 'message' | 'error' | 'ping';
  id?: string;
  data: string | object;
}

const PING_INTERVAL = 5000;

@CopilotEnabled()
@Controller('/api/copilot')
export class CopilotController implements BeforeApplicationShutdown {
  private readonly ongoingStreamCount$ = new BehaviorSubject(0);

  constructor(
    private readonly config: Config,
    private readonly orchestrator: TurnOrchestrator,
    private readonly actionStreams: ActionStreamHost
  ) {}

  async beforeApplicationShutdown() {
    await lastValueFrom(
      this.ongoingStreamCount$.asObservable().pipe(
        filter(count => count === 0),
        take(1)
      )
    );
    this.ongoingStreamCount$.complete();
  }

  private mergePingStream(
    messageId: string,
    source$: Observable<ChatEvent>
  ): Observable<ChatEvent> {
    const subject$ = new Subject();
    const ping$ = interval(PING_INTERVAL).pipe(
      map(() => ({ type: 'ping' as const, id: messageId, data: '' })),
      takeUntil(subject$)
    );

    return merge(source$.pipe(finalize(() => subject$.next(null))), ping$);
  }

  private toMessageEvent(messageId: string | undefined, data: string | object) {
    return { type: 'message' as const, id: messageId, data };
  }

  private toAttachmentEvent(messageId: string | undefined, data: string) {
    return { type: 'attachment' as const, id: messageId, data };
  }

  @Sse('/chat/:sessionId/stream')
  @CallMetric('ai', 'chat_stream', { timer: true })
  async chatStream(
    @CurrentUser() user: CurrentUser,
    @Req() req: Request,
    @Param('sessionId') sessionId: string,
    @Query() query: Record<string, string>
  ): Promise<Observable<ChatEvent>> {
    try {
      const { signal, onConnectionClosed } = getSignal(req);
      let endBeforePromiseResolve = false;
      onConnectionClosed(isAborted => {
        if (isAborted) {
          endBeforePromiseResolve = true;
        }
      });

      const prepared = await this.orchestrator.streamText(
        user.id,
        sessionId,
        query,
        signal,
        () => endBeforePromiseResolve
      );

      metrics.ai.counter('chat_stream_calls').add(1);
      this.ongoingStreamCount$.next(this.ongoingStreamCount$.value + 1);

      const source$ = from(prepared.stream).pipe(
        map(data => this.toMessageEvent(prepared.messageId, data)),
        catchError(e => {
          metrics.ai.counter('chat_stream_errors').add(1, { stage: 'stream' });
          return mapSseError(e, { endpoint: 'chat', stage: 'stream' });
        }),
        finalize(() => {
          this.ongoingStreamCount$.next(this.ongoingStreamCount$.value - 1);
        })
      );

      return this.mergePingStream(prepared.messageId || '', source$);
    } catch (err) {
      metrics.ai.counter('chat_stream_errors').add(1, { stage: 'prepare' });
      return mapSseError(err, { endpoint: 'chat', stage: 'prepare' });
    }
  }

  @Sse('/chat/:sessionId/stream-object')
  @CallMetric('ai', 'chat_object_stream', { timer: true })
  async chatStreamObject(
    @CurrentUser() user: CurrentUser,
    @Req() req: Request,
    @Param('sessionId') sessionId: string,
    @Query() query: Record<string, string>
  ): Promise<Observable<ChatEvent>> {
    try {
      const { signal, onConnectionClosed } = getSignal(req);
      let endBeforePromiseResolve = false;
      onConnectionClosed(isAborted => {
        if (isAborted) {
          endBeforePromiseResolve = true;
        }
      });

      const prepared = await this.orchestrator.streamObject(
        user.id,
        sessionId,
        query,
        signal,
        () => endBeforePromiseResolve
      );

      metrics.ai.counter('chat_object_stream_calls').add(1);
      this.ongoingStreamCount$.next(this.ongoingStreamCount$.value + 1);

      const source$ = from(prepared.stream).pipe(
        map(data => this.toMessageEvent(prepared.messageId, data)),
        catchError(e => {
          metrics.ai
            .counter('chat_object_stream_errors')
            .add(1, { stage: 'stream' });
          return mapSseError(e, {
            endpoint: 'chat_object',
            stage: 'stream',
          });
        }),
        finalize(() => {
          this.ongoingStreamCount$.next(this.ongoingStreamCount$.value - 1);
        })
      );

      return this.mergePingStream(prepared.messageId || '', source$);
    } catch (err) {
      metrics.ai
        .counter('chat_object_stream_errors')
        .add(1, { stage: 'prepare' });
      return mapSseError(err, {
        endpoint: 'chat_object',
        stage: 'prepare',
      });
    }
  }

  @Sse('/actions/:sessionId/stream')
  @CallMetric('ai', 'action_stream', { timer: true })
  async actionStream(
    @CurrentUser() user: CurrentUser,
    @Req() req: Request,
    @Param('sessionId') sessionId: string,
    @Query() query: Record<string, string>
  ): Promise<Observable<ChatEvent>> {
    try {
      const { signal } = getSignal(req);

      const prepared = await this.actionStreams.stream(
        user.id,
        sessionId,
        query,
        signal
      );
      metrics.ai.counter('action_stream_calls').add(1);
      this.ongoingStreamCount$.next(this.ongoingStreamCount$.value + 1);

      const source$ = from(prepared.stream).pipe(
        map(data => projectActionEventToChatEvent(prepared.messageId, data)),
        catchError(e => {
          metrics.ai
            .counter('action_stream_errors')
            .add(1, { stage: 'stream' });
          return mapSseError(e, { endpoint: 'action', stage: 'stream' });
        }),
        finalize(() =>
          this.ongoingStreamCount$.next(this.ongoingStreamCount$.value - 1)
        )
      );

      return this.mergePingStream(prepared.messageId || '', source$);
    } catch (err) {
      metrics.ai.counter('action_stream_errors').add(1, { stage: 'prepare' });
      return mapSseError(err, { endpoint: 'action', stage: 'prepare' });
    }
  }

  @Sse('/chat/:sessionId/images')
  @CallMetric('ai', 'chat_images', { timer: true })
  async chatImagesStream(
    @CurrentUser() user: CurrentUser,
    @Req() req: Request,
    @Param('sessionId') sessionId: string,
    @Query() query: Record<string, string>
  ): Promise<Observable<ChatEvent>> {
    try {
      const { signal, onConnectionClosed } = getSignal(req);
      let endBeforePromiseResolve = false;
      onConnectionClosed(isAborted => {
        if (isAborted) {
          endBeforePromiseResolve = true;
        }
      });

      const prepared = await this.orchestrator.streamImages(
        user.id,
        sessionId,
        query,
        signal,
        () => endBeforePromiseResolve
      );
      metrics.ai.counter('images_stream_calls').add(1);
      this.ongoingStreamCount$.next(this.ongoingStreamCount$.value + 1);

      const source$ = from(prepared.stream).pipe(
        map(attachment =>
          this.toAttachmentEvent(prepared.messageId, attachment)
        ),
        catchError(e => {
          metrics.ai
            .counter('images_stream_errors')
            .add(1, { stage: 'stream' });
          return mapSseError(e, { endpoint: 'images', stage: 'stream' });
        }),
        finalize(() =>
          this.ongoingStreamCount$.next(this.ongoingStreamCount$.value - 1)
        )
      );

      return this.mergePingStream(prepared.messageId || '', source$);
    } catch (err) {
      metrics.ai.counter('images_stream_errors').add(1, { stage: 'prepare' });
      return mapSseError(err, { endpoint: 'images', stage: 'prepare' });
    }
  }

  @Get('/unsplash/photos')
  @CallMetric('ai', 'unsplash')
  async unsplashPhotos(
    @Req() req: Request,
    @Res() res: Response,
    @Query() params: Record<string, string>
  ) {
    const { key } = this.config.copilot.unsplash;
    if (!key) {
      throw new UnsplashIsNotConfigured();
    }

    const query = new URLSearchParams(params);
    const response = await fetch(
      `https://api.unsplash.com/search/photos?${query}`,
      {
        headers: { Authorization: `Client-ID ${key}` },
        signal: getSignal(req).signal,
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
}
