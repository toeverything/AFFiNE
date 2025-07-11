import { Unreachable } from '@affine/env/constant';
import { LiveData, ObjectPool, Service } from '@toeverything/infra';
import { nanoid } from 'nanoid';
import { Observable, switchMap } from 'rxjs';

import { Server } from '../entities/server';
import { ServerStarted } from '../events/server-started';
import type { ServerConfigStore } from '../stores/server-config';
import type { ServerListStore } from '../stores/server-list';
import type { ServerConfig, ServerMetadata } from '../types';

export class ServersService extends Service {
  constructor(
    private readonly serverListStore: ServerListStore,
    private readonly serverConfigStore: ServerConfigStore
  ) {
    super();
  }

  servers$ = LiveData.from<Server[]>(
    this.serverListStore.watchServerList().pipe(
      switchMap(metadatas => {
        const refs = metadatas.map(metadata => {
          const exists = this.serverPool.get(metadata.id);
          if (exists) {
            return exists;
          }
          const server = this.framework.createEntity(Server, {
            serverMetadata: metadata,
          });
          server.revalidateConfig();
          server.scope.eventBus.emit(ServerStarted, server);
          const ref = this.serverPool.put(metadata.id, server);
          return ref;
        });

        return new Observable<Server[]>(subscribe => {
          subscribe.next(refs.map(ref => ref.obj));
          return () => {
            refs.forEach(ref => {
              ref.release();
            });
          };
        });
      })
    ),
    [] as any
  );

  serversWithAccount$ = this.servers$
    .map(servers =>
      servers.map(server =>
        server.account$.map(account => ({
          server,
          account,
        }))
      )
    )
    .flat();

  server$(id: string) {
    return this.servers$.map(servers =>
      servers.find(server => server.id === id)
    );
  }

  serverByBaseUrl$(url: string) {
    return this.servers$.map(servers =>
      servers.find(server => server.baseUrl === url)
    );
  }

  private readonly serverPool = new ObjectPool<string, Server>({
    onDelete(obj) {
      obj.dispose();
    },
  });

  addServer(metadata: ServerMetadata, config: ServerConfig) {
    this.serverListStore.addServer(metadata, config);
  }

  removeServer(id: string) {
    this.serverListStore.removeServer(id);
  }

  async addServerByBaseUrl(baseUrl: string) {
    const config = await this.serverConfigStore.fetchServerConfig(baseUrl);
    const id = nanoid();
    this.serverListStore.addServer(
      { id, baseUrl },
      {
        credentialsRequirement: config.credentialsRequirement,
        features: config.features,
        oauthProviders: config.oauthProviders,
        serverName: config.name,
        type: config.type,
        initialized: config.initialized,
        version: config.version,
      }
    );
  }

  getServerByBaseUrl(baseUrl: string) {
    return this.servers$.value.find(s => s.baseUrl === baseUrl);
  }

  async addOrGetServerByBaseUrl(baseUrl: string) {
    const server = this.getServerByBaseUrl(baseUrl);
    if (server) {
      return server;
    } else {
      await this.addServerByBaseUrl(baseUrl);
      const server = this.getServerByBaseUrl(baseUrl);
      if (!server) {
        throw new Unreachable();
      }
      return server;
    }
  }
}
