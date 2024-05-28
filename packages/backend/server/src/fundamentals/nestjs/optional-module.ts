import {
  DynamicModule,
  Module,
  ModuleMetadata,
  Provider,
  Type,
} from '@nestjs/common';
import { omit } from 'lodash-es';

import type { AFFiNEConfig, ConfigPaths } from '../config';

export interface OptionalModuleMetadata extends ModuleMetadata {
  /**
   * Only install module if given config paths are defined in AFFiNE config.
   */
  requires?: ConfigPaths[];

  /**
   * Only install module if the predication returns true.
   */
  if?: (config: AFFiNEConfig) => boolean;

  /**
   * Defines which feature will be enabled if the module installed.
   */
  contributesTo?: import('../../core/config').ServerFeature; // avoid circlar dependency

  /**
   * Defines which providers provided by other modules will be overridden if the module installed.
   */
  overrides?: Provider[];
}

const additionalOptions = [
  'contributesTo',
  'requires',
  'if',
  'overrides',
] as const satisfies Array<keyof OptionalModuleMetadata>;

type OptionalDynamicModule = DynamicModule & OptionalModuleMetadata;

export function OptionalModule(metadata: OptionalModuleMetadata) {
  return (target: Type) => {
    additionalOptions.forEach(option => {
      if (Object.hasOwn(metadata, option)) {
        Reflect.defineMetadata(option, metadata[option], target);
      }
    });

    if (metadata.overrides) {
      metadata.providers = (metadata.providers ?? []).concat(
        metadata.overrides
      );
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      metadata.exports = (metadata.exports ?? []).concat(metadata.overrides);
    }

    const nestMetadata = omit(metadata, additionalOptions);
    Module(nestMetadata)(target);
  };
}

export function getOptionalModuleMetadata<
  T extends keyof OptionalModuleMetadata,
>(target: Type | OptionalDynamicModule, key: T): OptionalModuleMetadata[T] {
  if ('module' in target) {
    return target[key];
  } else {
    return Reflect.getMetadata(key, target);
  }
}
