import {
  type AppConfigSchema,
  AppConfigStorage,
  defaultAppConfig,
} from '@toeverything/infra/app-config-storage';
import { type Dispatch, useEffect, useState } from 'react';

/**
 * Helper class to get/set app config from main process
 */
class AppConfigProxy {
  value: AppConfigSchema = defaultAppConfig;

  async getSync(): Promise<AppConfigSchema> {
    return (this.value = await window.apis.configStorage.get());
  }

  async setSync(): Promise<void> {
    await window.apis.configStorage.set(this.value);
  }

  get(): AppConfigSchema {
    return this.value;
  }

  set(data: AppConfigSchema) {
    this.value = data;
    this.setSync().catch(console.error);
  }
}
export const appConfigProxy = new AppConfigProxy();

const storage = environment.isDesktop
  ? new AppConfigStorage({
      config: defaultAppConfig,
      get: () => appConfigProxy.get(),
      set: v => appConfigProxy.set(v),
    })
  : new AppConfigStorage({
      config: defaultAppConfig,
      get: () => JSON.parse(localStorage.getItem('app_config') ?? '{}'),
      set: config => localStorage.setItem('app_config', JSON.stringify(config)),
    });

export const appConfigStorage = storage;

export function useAppConfigStorage(): [
  AppConfigSchema,
  Dispatch<AppConfigSchema>,
];
export function useAppConfigStorage(
  key: keyof AppConfigSchema
): [AppConfigSchema[typeof key], Dispatch<AppConfigSchema[typeof key]>];

/**
 * Get reactive app config
 * @param key
 * @returns
 */
export function useAppConfigStorage(key?: keyof AppConfigSchema) {
  const [_config, _setConfig] = useState(storage.get());

  useEffect(() => {
    storage.set(_config);
  }, [_config]);

  if (key) {
    const value = _config[key];
    const setValue = (value: AppConfigSchema[typeof key]) => {
      _setConfig(cfg => ({ ...cfg, [key]: value }));
    };
    return [value, setValue];
  } else {
    const config = _config;
    const setConfig = (config: AppConfigSchema) => {
      storage.set(config);
      _setConfig(config);
    };

    return [config, setConfig];
  }
}
