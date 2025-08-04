import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { set } from 'lodash-es';

import {
  ConfigFactory,
  EventBus,
  InvalidAppConfigInput,
  OnEvent,
} from '../../base';
import { Models } from '../../models';
import { ServerFeature } from './types';

declare global {
  interface Events {
    'config.init': {
      config: DeepReadonly<AppConfig>;
    };
    'config.changed': {
      updates: DeepPartial<AppConfig>;
    };
    'config.changed.broadcast': {
      updates: DeepPartial<AppConfig>;
    };
  }
}

@Injectable()
export class ServerService implements OnApplicationBootstrap {
  private _initialized: boolean | null = null;
  readonly #features = new Set<ServerFeature>();
  readonly #logger = new Logger(ServerService.name);

  constructor(
    private readonly models: Models,
    private readonly configFactory: ConfigFactory,
    private readonly event: EventBus
  ) {}

  async onApplicationBootstrap() {
    await this.setup();
  }

  get features() {
    return Array.from(this.#features);
  }

  async initialized() {
    if (!this._initialized) {
      const userCount = await this.models.user.count();
      this._initialized = userCount > 0;
    }

    return this._initialized;
  }

  enableFeature(feature: ServerFeature) {
    this.#features.add(feature);
  }

  disableFeature(feature: ServerFeature) {
    this.#features.delete(feature);
  }

  getConfig() {
    return this.configFactory.clone();
  }

  validateConfig(updates: Array<{ module: string; key: string; value: any }>) {
    return this.configFactory.validate(updates);
  }

  async updateConfig(
    user: string,
    updates: Array<{ module: string; key: string; value: any }>
  ): Promise<DeepPartial<AppConfig>> {
    const errors = this.configFactory.validate(updates);

    if (errors?.length) {
      throw new InvalidAppConfigInput({
        message: errors.map(error => error.message).join('\n'),
      });
    }

    const promises = await this.models.appConfig.save(
      user,
      updates.map(update => ({
        key: `${update.module}.${update.key}`,
        value: update.value,
      }))
    );

    const overrides: DeepPartial<AppConfig> = {};
    // only take successfully saved configs
    promises.forEach(promise => {
      if (promise.status === 'fulfilled') {
        set(overrides, promise.value.id, promise.value.value);
      } else {
        this.#logger.error(`Failed to save app config`, promise.reason);
      }
    });
    this.configFactory.override(overrides);
    await this.event.emitAsync('config.changed', { updates: overrides });
    this.event.broadcast('config.changed.broadcast', { updates: overrides });
    return overrides;
  }

  @OnEvent('config.changed.broadcast')
  onConfigChangedBroadcast(event: Events['config.changed.broadcast']) {
    this.configFactory.override(event.updates);
    this.event.emit('config.changed', event);
  }

  @OnEvent('config.changed')
  onConfigChanged(event: Events['config.changed']) {
    if ('flags' in event.updates) {
      this.onFlagsChanged();
    }
  }

  async revalidateConfig() {
    const overrides = await this.loadDbOverrides();
    this.configFactory.override(overrides);
    this.event.emit('config.changed', { updates: overrides });
  }

  private async setup() {
    const overrides = await this.loadDbOverrides();
    this.configFactory.override(overrides);
    await this.event.emitAsync('config.init', {
      config: this.configFactory.config,
    });
    this.onFlagsChanged();
  }

  private async loadDbOverrides() {
    const configs = await this.models.appConfig.load();
    const overrides: DeepPartial<AppConfig> = {};

    configs.forEach(config => {
      set(overrides, config.id, config.value);
    });

    return overrides;
  }

  private onFlagsChanged() {
    const flags = this.configFactory.config.flags;
    if (flags.allowGuestDemoWorkspace) {
      this.enableFeature(ServerFeature.LocalWorkspace);
    } else {
      this.disableFeature(ServerFeature.LocalWorkspace);
    }
  }
}
