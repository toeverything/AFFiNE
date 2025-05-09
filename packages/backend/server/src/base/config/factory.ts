import { Inject, Injectable, Optional } from '@nestjs/common';

import { InvalidAppConfig } from '../error';
import { APP_CONFIG_DESCRIPTORS, getDefaultConfig, override } from './register';

export const OVERRIDE_CONFIG_TOKEN = Symbol('OVERRIDE_CONFIG_TOKEN');

@Injectable()
export class ConfigFactory {
  readonly #original: AppConfig;
  readonly #config: AppConfig;
  get config() {
    return this.#config;
  }

  constructor(
    @Inject(OVERRIDE_CONFIG_TOKEN)
    @Optional()
    private readonly overrides: DeepPartial<AppConfig> = {}
  ) {
    this.#original = this.loadDefault();
    this.#config = structuredClone(this.#original);
  }

  clone() {
    // we did not freeze the #config object, it might be modified
    return structuredClone(this.#original);
  }

  override(updates: DeepPartial<AppConfig>) {
    override(this.#original, updates);
    override(this.#config, updates);
  }

  validate(updates: Array<{ module: string; key: string; value: any }>) {
    const errors: string[] = [];

    updates.forEach(update => {
      const descriptor = APP_CONFIG_DESCRIPTORS[update.module]?.[update.key];
      if (!descriptor) {
        errors.push(
          `Invalid config for module [${update.module}] with unknown key [${update.key}]`
        );
        return;
      }

      const { success, error } = descriptor.validate(update.value);
      if (!success) {
        error.issues.forEach(issue => {
          errors.push(`Invalid config for module [${update.module}] with key [${update.key}]
Value: ${JSON.stringify(update.value)}
Error: ${issue.message}`);
        });
      }
    });

    if (errors.length > 0) {
      throw new InvalidAppConfig(errors.join('\n'));
    }
  }

  private loadDefault() {
    const config = getDefaultConfig();
    override(config, this.overrides);
    return config;
  }
}
