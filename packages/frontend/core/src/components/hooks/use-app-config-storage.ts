import { apis } from '@affine/electron-api';
import { assertExists } from '@blocksuite/affine/global/utils';
import type { AppConfigSchema } from '@toeverything/infra';
import { AppConfigStorage, defaultAppConfig } from '@toeverything/infra';
import type { Dispatch } from 'react';
import { useEffect, useMemo, useState } from 'react';

/**
 * Helper class to get/set app config from main process
 */
class AppConfigProxy {
  value: AppConfigSchema = defaultAppConfig;

  async getSync(): Promise<AppConfigSchema> {
    assertExists(apis);
    return (this.value = await apis.configStorage.get());
  }

  async setSync(): Promise<void> {
    assertExists(apis);
    await apis.configStorage.set(this.value);
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

const storage = BUILD_CONFIG.isElectron
  ? new AppConfigStorage({
      config: defaultAppConfig,
      get: () => appConfigProxy.get(),
      set: v => appConfigProxy.set(v),
    })
  : new AppConfigStorage({
      config: defaultAppConfig,
      get: () => JSON.parse(localStorage.getItem('app_config') ?? 'null'),
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

  const value = useMemo(() => (key ? _config[key] : _config), [_config, key]);

  const setValue = useMemo(() => {
    if (key) {
      return (value: AppConfigSchema[typeof key]) => {
        _setConfig(cfg => ({ ...cfg, [key]: value }));
      };
    } else {
      return (config: AppConfigSchema) => {
        _setConfig(config);
      };
    }
  }, [_setConfig, key]);

  return [value, setValue];
}
