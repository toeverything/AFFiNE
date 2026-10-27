import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { get, has, set, unset } from 'lodash-es';

import {
  ConfigFactory,
  EventBus,
  InvalidAppConfig,
  InvalidAppConfigInput,
  OnEvent,
} from '../../base';
import { APP_CONFIG_DESCRIPTORS } from '../../base/config/register';
import { NODE_SECRET_CONFIG_KEYS } from '../../base/config/secrets';
import { SocketIoRedis } from '../../base/redis';
import { Models } from '../../models';
import { ServerConfigHandle } from '../../native';
import { BackendRuntimeProvider } from '../backend-runtime';
import { ServerFeature } from './types';

function isConfigured(value: unknown): boolean {
  if (typeof value === 'string') return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === 'object') {
    return Object.values(value).some(isConfigured);
  }
  return value !== null && value !== undefined;
}

declare global {
  interface Events {
    'config.init': {
      config: DeepReadonly<AppConfig>;
    };
    'config.changed': {
      updates: DeepPartial<AppConfig>;
    };
    'config.changed.broadcast':
      | { keys: string[] }
      // TODO(0.27.5): Remove this 0.27.4 payload type after 0.27.5 is live and old instances exit.
      | { updates: DeepPartial<AppConfig> };
  }
}

@Injectable()
export class ServerService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private _initialized: boolean | null = null;
  readonly #features = new Set<ServerFeature>();
  readonly #secretConfigKeys: ReadonlySet<string>;
  readonly #logger = new Logger(ServerService.name);
  readonly #onRedisReady = () => {
    this.revalidateConfig().catch(error => {
      this.#logger.error(
        'Failed to reload app config after Redis reconnect',
        error
      );
    });
  };

  constructor(
    private readonly models: Models,
    private readonly configFactory: ConfigFactory,
    private readonly event: EventBus,
    private readonly socketRedis: SocketIoRedis,
    private readonly runtime: BackendRuntimeProvider,
    private readonly serverConfig: ServerConfigHandle
  ) {
    this.#secretConfigKeys = new Set([
      ...NODE_SECRET_CONFIG_KEYS,
      ...serverConfig.nativeSecretAppConfigKeys(),
    ]);
  }

  async onApplicationBootstrap() {
    await this.setup();
    this.socketRedis.off('ready', this.#onRedisReady);
    this.socketRedis.on('ready', this.#onRedisReady);
  }

  onApplicationShutdown() {
    this.socketRedis.off('ready', this.#onRedisReady);
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

  getAdminConfig(
    config: DeepPartial<AppConfig> = this.getConfig()
  ): DeepPartial<AppConfig> {
    const visible = structuredClone(config);
    for (const key of this.#secretConfigKeys) {
      unset(visible, key);
    }
    return visible;
  }

  async getEffectiveAdminConfig(): Promise<DeepPartial<AppConfig>> {
    const visible = this.getAdminConfig();
    const nativeKeys = new Set(this.serverConfig.nativeAppConfigKeys());
    const file = JSON.parse(this.serverConfig.publicNativeBaselineJson());
    for (const key of nativeKeys) {
      if (this.#secretConfigKeys.has(key)) continue;
      const [module, ...segments] = key.split('.');
      const descriptor = APP_CONFIG_DESCRIPTORS[module]?.[segments.join('.')];
      if (descriptor) {
        set(visible, key, structuredClone(descriptor.default));
      }
      if (has(file, key)) {
        set(visible, key, get(file, key));
      }
    }
    const redisUrl = this.serverConfig.redisUrl();
    if (redisUrl) {
      const redis = new URL(redisUrl);
      set(visible, 'redis.host', redis.hostname);
      set(visible, 'redis.port', Number(redis.port || 6379));
      set(visible, 'redis.db', Number(redis.pathname.slice(1) || 0));
      set(visible, 'redis.username', decodeURIComponent(redis.username));
    }
    for (const config of await this.models.appConfig.load()) {
      if (nativeKeys.has(config.id) && !this.#secretConfigKeys.has(config.id)) {
        set(visible, config.id, config.value);
      }
    }
    return visible;
  }

  getAdminConfigValue(module: string, key: string, value: unknown) {
    return this.#secretConfigKeys.has(`${module}.${key}`) ? undefined : value;
  }

  isSecretConfigKey(module: string, key: string): boolean {
    return this.#secretConfigKeys.has(`${module}.${key}`);
  }

  async getAdminConfigMetadata(): Promise<Record<string, unknown>> {
    const config = this.getConfig();
    const database = new Map(
      (await this.models.appConfig.load()).map(config => [
        config.id,
        config.value,
      ])
    );
    const staticKeys = new Set(this.serverConfig.staticAppConfigKeys());
    const metadata: Record<string, unknown> = {};
    for (const [module, descriptors] of Object.entries(
      APP_CONFIG_DESCRIPTORS
    )) {
      for (const [name, descriptor] of Object.entries(descriptors)) {
        const key = `${module}.${name}`;
        const redisEnv =
          module === 'redis' &&
          name !== 'ioredis' &&
          (process.env.REDIS_SERVER_URL ||
            (descriptor.env && process.env[descriptor.env[0]]));
        const cryptoEnv =
          key === 'crypto.privateKey' &&
          !this.serverConfig.baselineConfigKeyConfigured(key) &&
          process.env.AFFINE_PRIVATE_KEY;
        const source = redisEnv
          ? 'environment'
          : database.has(key)
            ? 'database'
            : cryptoEnv
              ? 'environment'
              : this.serverConfig.hasBaselineConfigKey(key)
                ? 'file'
                : descriptor.env && process.env[descriptor.env[0]]
                  ? 'environment'
                  : 'default';
        const configured = this.configFactory.isNativeSecretKey(key)
          ? source === 'database'
            ? isConfigured(database.get(key))
            : source === 'file'
              ? this.serverConfig.baselineConfigKeyConfigured(key)
              : source === 'environment'
                ? key === 'redis.password' && process.env.REDIS_SERVER_URL
                  ? isConfigured(new URL(process.env.REDIS_SERVER_URL).password)
                  : isConfigured(
                      descriptor.env && process.env[descriptor.env[0]]
                    )
                : isConfigured(descriptor.default)
          : isConfigured(get(config, key));
        set(metadata, key, {
          source,
          settable: !staticKeys.has(key),
          ...(this.#secretConfigKeys.has(key) ? { configured } : {}),
        });
      }
    }
    return metadata;
  }

  validateConfig(
    updates: Array<{
      module: string;
      key: string;
      value?: any;
      clear?: boolean;
    }>
  ) {
    const errors = this.configFactory.validate(updates) ?? [];
    const staticKeys = new Set(this.serverConfig.staticAppConfigKeys());
    for (const update of updates) {
      if (!update.clear && staticKeys.has(`${update.module}.${update.key}`)) {
        errors.push(
          new InvalidAppConfig({
            module: update.module,
            key: update.key,
            hint: 'This setting is read at startup and cannot be saved as a database override',
          })
        );
      }
    }
    return errors.length ? errors : null;
  }

  async updateConfig(
    user: string | null,
    updates: Array<{
      module: string;
      key: string;
      value?: any;
      clear?: boolean;
    }>,
    notify = true
  ): Promise<DeepPartial<AppConfig>> {
    const providerType = updates.find(
      update =>
        update.module === 'indexer' &&
        update.key === 'provider.type' &&
        !update.clear
    );
    if (providerType) {
      updates = [
        ...updates.filter(
          update => !(update.module === 'indexer' && update.key === 'enabled')
        ),
        { module: 'indexer', key: 'enabled', value: true },
      ];
    }
    const errors = this.validateConfig(updates);

    if (errors?.length) {
      throw new InvalidAppConfigInput({
        message: errors
          .map(error =>
            this.isSecretConfigKey(error.data.module, error.data.key)
              ? `Invalid value for ${error.data.module}.${error.data.key}`
              : error.message
          )
          .join('\n'),
      });
    }

    const nativeKeys = new Set(this.serverConfig.nativeAppConfigKeys());
    const keys = updates.map(update => `${update.module}.${update.key}`);
    await this.runtime.saveAppConfig(
      user,
      updates.map((update, index) => ({
        key: keys[index],
        owner: nativeKeys.has(keys[index]) ? 'native' : 'node',
        operation: update.clear ? 'clear' : 'set',
        valueJson: update.clear ? undefined : JSON.stringify(update.value),
      }))
    );

    if (!notify) {
      return {};
    }

    const saved = await Promise.all(
      keys.map(key => this.models.appConfig.get(key))
    );

    const overrides: DeepPartial<AppConfig> = {};
    saved.forEach((config, index) => {
      if (config) {
        set(overrides, config.id, config.value);
      } else {
        const key = keys[index];
        this.configFactory.resetPath(key);
        set(overrides, key, get(this.configFactory.config, key));
      }
    });
    this.configFactory.override(overrides);
    try {
      await this.event.emitAsync('config.changed', {
        updates: this.configFactory.redactNativeValues(overrides),
      });
    } catch (error) {
      this.#logger.error(
        `Failed to apply committed app config update: ${error instanceof Error ? error.name : 'unknown'}`
      );
    }
    this.event.broadcast('config.changed.broadcast', {
      keys,
    });
    const effective = await this.getEffectiveAdminConfig();
    const visible: DeepPartial<AppConfig> = {};
    for (const key of keys) {
      if (!this.#secretConfigKeys.has(key) && has(effective, key)) {
        set(visible, key, get(effective, key));
      }
    }
    return visible;
  }

  @OnEvent('config.changed.broadcast')
  async onConfigChangedBroadcast(event: Events['config.changed.broadcast']) {
    // TODO(0.27.5): Remove legacy { updates } handling after 0.27.5 is live and all 0.27.4 instances exit.
    const keys =
      'keys' in event
        ? event.keys
        : Object.entries(APP_CONFIG_DESCRIPTORS).flatMap(
            ([module, descriptors]) =>
              Object.keys(descriptors)
                .map(key => `${module}.${key}`)
                .filter(key => has(event.updates, key))
          );
    const configs = await Promise.all(
      keys.map(key => this.models.appConfig.get(key))
    );
    const updates: DeepPartial<AppConfig> = {};
    configs.forEach(config => {
      if (config) {
        set(updates, config.id, config.value);
      }
    });
    configs.forEach((config, index) => {
      if (!config) {
        const key = keys[index];
        this.configFactory.resetPath(key);
        set(updates, key, get(this.configFactory.config, key));
      }
    });
    this.configFactory.override(updates);
    this.event.emit('config.changed', {
      updates: this.configFactory.redactNativeValues(updates),
    });
  }

  @OnEvent('config.changed')
  onConfigChanged(event: Events['config.changed']) {
    if ('flags' in event.updates) {
      this.onFlagsChanged();
    }
  }

  async revalidateConfig() {
    const overrides = await this.loadDbOverrides();
    const updates = this.configFactory.replaceDbOverrides(overrides);
    this.event.emit('config.changed', { updates });
  }

  private async setup() {
    const overrides = await this.loadDbOverrides();
    this.configFactory.replaceDbOverrides(overrides);
    await this.event.emitAsync('config.init', {
      config: this.getConfig(),
    });
    this.onFlagsChanged();
  }

  private async loadDbOverrides() {
    const configs = await this.models.appConfig.load([
      'auth.session.signingKeys',
    ]);
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
