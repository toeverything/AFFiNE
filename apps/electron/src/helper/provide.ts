import type { ExposedMeta } from '@toeverything/infra/preload/electron';

/**
 * A naive DI implementation to get rid of circular dependency.
 */

export let exposed: ExposedMeta | undefined;

export const provideExposed = (exposedMeta: ExposedMeta) => {
  exposed = exposedMeta;
};
