import { shallowEqual } from '@affine/component';
import { ServerDeploymentType } from '@affine/graphql';
import { LiveData, OnEvent, Service } from '@toeverything/infra';

import type { GlobalContextService } from '../../global-context';
import { ApplicationStarted } from '../../lifecycle';
import type { NbstoreService } from '../../storage';
import type { Server } from '../entities/server';
import type { ServersService } from './servers';

@OnEvent(ApplicationStarted, service => service.onApplicationStarted)
export class RealtimeService extends Service {
  readonly connectionError$ = new LiveData<{
    endpoint: string;
    error: unknown;
  } | null>(null);
  private contextGeneration = 0;

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
      this.configure(context, generation).catch(error => {
        console.error('Failed to configure realtime context', error);
      });
    });
    this.disposables.push(() => subscription.unsubscribe());
  }

  onApplicationStarted() {}

  private async configure(
    context: {
      endpoint: string;
      authenticated: boolean;
      isSelfHosted: boolean;
    },
    generation: number
  ) {
    await this.nbstoreService.realtime.configure(context);
    if (generation !== this.contextGeneration) return;
    if (!context.endpoint || !context.authenticated) {
      this.connectionError$.next(null);
      return;
    }

    try {
      await this.nbstoreService.realtime.request(
        'user.profile.get',
        {},
        { timeoutMs: 10_000 }
      );
      if (generation === this.contextGeneration) {
        this.connectionError$.next(null);
      }
    } catch (error) {
      if (generation === this.contextGeneration) {
        this.connectionError$.next({ endpoint: context.endpoint, error });
      }
    }
  }
}
