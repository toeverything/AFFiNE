import { shallowEqual } from '@affine/component';
import { ServerDeploymentType } from '@affine/graphql';
import { LiveData, OnEvent, Service } from '@toeverything/infra';

import type { GlobalContextService } from '../../global-context';
import { ApplicationStarted } from '../../lifecycle';
import type { NbstoreService } from '../../storage';
import type { Server } from '../entities/server';
import type { ServersService } from './servers';

const CONNECTION_FAILURE_THRESHOLD = 3;
const INITIAL_RETRY_DELAY = 3000;
const MAX_RETRY_DELAY = 60000;

function getConnectionErrorType(error: unknown) {
  if (!(error instanceof Error)) {
    return 'server';
  }

  const detail = `${error.name} ${error.message}`.toLowerCase();
  if (
    detail.includes('auth') ||
    detail.includes('forbidden') ||
    detail.includes('unauthorized') ||
    detail.includes('jwt')
  ) {
    return 'authentication';
  }
  if (detail.includes('timeout') || detail.includes('timed out')) {
    return 'timeout';
  }
  if (
    detail.includes('network') ||
    detail.includes('transport') ||
    detail.includes('websocket') ||
    detail.includes('xhr') ||
    detail.includes('connect')
  ) {
    return 'network';
  }
  return 'server';
}

function waitForRetry(delay: number, signal: AbortSignal) {
  return new Promise<void>(resolve => {
    const onAbort = () => {
      clearTimeout(timeout);
      resolve();
    };
    const timeout = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, delay);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

@OnEvent(ApplicationStarted, service => service.onApplicationStarted)
export class RealtimeService extends Service {
  readonly connectionError$ = new LiveData<{
    endpoint: string;
    error: unknown;
    type: ReturnType<typeof getConnectionErrorType>;
  } | null>(null);
  private contextGeneration = 0;
  private probeAbort?: AbortController;

  private readonly currentServer$ =
    this.globalContextService.globalContext.serverId.$.selector(id =>
      id
        ? this.serversService.server$(id)
        : new LiveData<Server | undefined>(undefined)
    )
      .flat()
      .selector(
        server =>
          [
            server,
            server?.account$,
            server?.config$.selector(
              c => c.type === ServerDeploymentType.Selfhosted
            ),
          ] as const
      )
      .flat()
      .map(([server, account, selfHosted]) => ({
        endpoint: server?.baseUrl ?? '',
        authenticated: !!account,
        isSelfHosted: !!selfHosted,
      }))
      .distinctUntilChanged(shallowEqual);

  constructor(
    private readonly globalContextService: GlobalContextService,
    private readonly serversService: ServersService,
    private readonly nbstoreService: NbstoreService
  ) {
    super();

    const subscription = this.currentServer$.subscribe(context => {
      const generation = ++this.contextGeneration;
      this.probeAbort?.abort();
      const probeAbort = new AbortController();
      this.probeAbort = probeAbort;
      this.configure(context, generation, probeAbort.signal).catch(error => {
        console.error('Failed to configure realtime context', error);
      });
    });
    this.disposables.push(() => {
      subscription.unsubscribe();
      this.probeAbort?.abort();
    });
  }

  onApplicationStarted() {}

  private async configure(
    context: {
      endpoint: string;
      authenticated: boolean;
      isSelfHosted: boolean;
    },
    generation: number,
    signal: AbortSignal
  ) {
    await this.nbstoreService.realtime.configure(context);
    if (generation !== this.contextGeneration) return;
    if (!context.endpoint || !context.authenticated) {
      this.connectionError$.next(null);
      return;
    }

    let failures = 0;
    let retryDelay = INITIAL_RETRY_DELAY;
    while (generation === this.contextGeneration && !signal.aborted) {
      try {
        await this.nbstoreService.realtime.request(
          'user.profile.get',
          {},
          { timeoutMs: 10_000, signal }
        );
        if (generation === this.contextGeneration && !signal.aborted) {
          this.connectionError$.next(null);
        }
        return;
      } catch (error) {
        if (signal.aborted || generation !== this.contextGeneration) {
          return;
        }
        failures++;
        if (failures >= CONNECTION_FAILURE_THRESHOLD) {
          this.connectionError$.next({
            endpoint: context.endpoint,
            error,
            type: getConnectionErrorType(error),
          });
        }
      }
      await waitForRetry(retryDelay, signal);
      retryDelay = Math.min(retryDelay * 2, MAX_RETRY_DELAY);
    }
  }
}
