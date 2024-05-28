import { OnEvent } from '../../event';
import { Payload } from '../../event/def';
import { FlattenedAppRuntimeConfig } from '../types';

declare module '../../event/def' {
  interface EventDefinitions {
    runtimeConfig: {
      [K in keyof FlattenedAppRuntimeConfig]: {
        changed: Payload<FlattenedAppRuntimeConfig[K]>;
      };
    };
  }
}

/**
 * not implemented yet
 */
export const OnRuntimeConfigChange_DO_NOT_USE = (
  nameWithModule: keyof FlattenedAppRuntimeConfig
) => {
  return OnEvent(`runtimeConfig.${nameWithModule}.changed`);
};
