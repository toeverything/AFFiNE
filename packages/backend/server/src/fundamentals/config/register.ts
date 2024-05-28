import { Prisma, RuntimeConfigType } from '@prisma/client';
import { get, merge, set } from 'lodash-es';

import {
  AppModulesConfigDef,
  AppStartupConfig,
  ModuleRuntimeConfigDescriptions,
  ModuleStartupConfigDescriptions,
} from './types';

export const defaultStartupConfig: AppStartupConfig = {} as any;
export const defaultRuntimeConfig: Record<
  string,
  Prisma.RuntimeConfigCreateInput
> = {} as any;

export function runtimeConfigType(val: any): RuntimeConfigType {
  if (Array.isArray(val)) {
    return RuntimeConfigType.Array;
  }

  switch (typeof val) {
    case 'string':
      return RuntimeConfigType.String;
    case 'number':
      return RuntimeConfigType.Number;
    case 'boolean':
      return RuntimeConfigType.Boolean;
    default:
      return RuntimeConfigType.Object;
  }
}

function registerRuntimeConfig<T extends keyof AppModulesConfigDef>(
  module: T,
  configs: ModuleRuntimeConfigDescriptions<T>
) {
  Object.entries(configs).forEach(([key, value]) => {
    defaultRuntimeConfig[`${module}/${key}`] = {
      id: `${module}/${key}`,
      module,
      key,
      description: value.desc,
      value: value.default,
      type: runtimeConfigType(value.default),
    };
  });
}

export function defineStartupConfig<T extends keyof AppModulesConfigDef>(
  module: T,
  configs: ModuleStartupConfigDescriptions<AppModulesConfigDef[T]>
) {
  set(
    defaultStartupConfig,
    module,
    merge(get(defaultStartupConfig, module, {}), configs)
  );
}

export function defineRuntimeConfig<T extends keyof AppModulesConfigDef>(
  module: T,
  configs: ModuleRuntimeConfigDescriptions<T>
) {
  registerRuntimeConfig(module, configs);
}
