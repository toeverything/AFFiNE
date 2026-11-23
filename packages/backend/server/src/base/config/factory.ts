import { Inject, Injectable, Optional } from '@nestjs/common';
import { get, isEqual, set, unset } from 'lodash-es';

import { ServerConfigHandle } from '../../native';
import { InvalidAppConfig } from '../error';
import { APP_CONFIG_DESCRIPTORS, getDefaultConfig, override } from './register';

export const OVERRIDE_CONFIG_TOKEN = Symbol('OVERRIDE_CONFIG_TOKEN');

@Injectable()
export class ConfigFactory {
  readonly #static: AppConfig;
  readonly #original: AppConfig;
  readonly #config: AppConfig;
  readonly #nativeKeys: ReadonlySet<string>;
  readonly #nativeSecretKeys: ReadonlySet<string>;
  get config() {
    return this.#config;
  }

  constructor(
    private readonly serverConfig: ServerConfigHandle,
    @Inject(OVERRIDE_CONFIG_TOKEN)
    @Optional()
    private readonly overrides: DeepPartial<AppConfig> = {}
  ) {
    this.#nativeKeys = new Set(this.serverConfig.nativeAppConfigKeys());
    this.#nativeSecretKeys = new Set(
      this.serverConfig.nativeSecretAppConfigKeys()
    );
    this.#static = this.loadDefault();
    this.#original = structuredClone(this.#static);
    this.#config = structuredClone(this.#original);
  }

  clone() {
    // we did not freeze the #config object, it might be modified
    return structuredClone(this.#original);
  }

  override(updates: DeepPartial<AppConfig>) {
    const visible = this.withoutNativeValues(updates);
    override(this.#original, visible);
    override(this.#config, visible);
  }

  private withoutNativeValues(
    updates: DeepPartial<AppConfig>
  ): DeepPartial<AppConfig> {
    const visible = structuredClone(updates);
    for (const key of this.#nativeKeys) {
      unset(visible, key);
    }
    return visible;
  }

  redactNativeValues(updates: DeepPartial<AppConfig>): DeepPartial<AppConfig> {
    const redacted = structuredClone(updates);
    for (const key of this.#nativeKeys) {
      if (get(redacted, key) !== undefined) {
        set(redacted, key, undefined);
      }
    }
    return redacted;
  }

  isNativeSecretKey(key: string) {
    return this.#nativeSecretKeys.has(key);
  }

  resetPath(path: string) {
    const value = get(this.#static, path);
    if (value === undefined) {
      unset(this.#original, path);
      unset(this.#config, path);
    } else {
      set(this.#original, path, structuredClone(value));
      set(this.#config, path, structuredClone(value));
    }
  }

  replaceDbOverrides(updates: DeepPartial<AppConfig>): DeepPartial<AppConfig> {
    const previous = this.clone();
    const changed = this.withoutNativeValues(updates);
    for (const [module, descriptors] of Object.entries(
      APP_CONFIG_DESCRIPTORS
    )) {
      for (const key of Object.keys(descriptors)) {
        const path = `${module}.${key}`;
        this.resetPath(path);
      }
    }
    this.override(updates);
    for (const [module, descriptors] of Object.entries(
      APP_CONFIG_DESCRIPTORS
    )) {
      for (const key of Object.keys(descriptors)) {
        const path = `${module}.${key}`;
        const value = get(this.#original, path);
        if (!isEqual(get(previous, path), value)) {
          set(changed, path, value);
        }
      }
    }
    for (const key of this.#nativeKeys) {
      set(changed, key, undefined);
    }
    return changed;
  }

  validate(
    updates: Array<{
      module: string;
      key: string;
      value?: any;
      clear?: boolean;
    }>
  ) {
    const errors: InvalidAppConfig[] = [];

    updates.forEach(update => {
      const descriptor = APP_CONFIG_DESCRIPTORS[update.module]?.[update.key];
      if (!descriptor) {
        errors.push(
          new InvalidAppConfig({
            module: update.module,
            key: update.key,
            hint: `Unknown config [${update.key}]`,
          })
        );
        return;
      }

      if (update.clear) {
        return;
      }

      if (update.value === undefined) {
        errors.push(
          new InvalidAppConfig({
            module: update.module,
            key: update.key,
            hint: 'A value is required when setting config',
          })
        );
        return;
      }

      const { success, error } = descriptor.validate(update.value);
      if (!success) {
        error.issues.forEach(issue => {
          errors.push(
            new InvalidAppConfig({
              module: update.module,
              key: update.key,
              hint: issue.message,
            })
          );
        });
      }
    });

    return errors.length > 0 ? errors : null;
  }

  private loadDefault() {
    const config = getDefaultConfig(this.#nativeKeys);
    override(config, JSON.parse(this.serverConfig.nodeOwnedJson()));
    override(config, this.withoutNativeValues(this.overrides));
    return config;
  }
}
