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
      this.nbstoreService.realtime.configure(context).catch(error => {
        console.error('Failed to configure realtime context', error);
      });
    });
    this.disposables.push(() => subscription.unsubscribe());
  }

  onApplicationStarted() {}
}
