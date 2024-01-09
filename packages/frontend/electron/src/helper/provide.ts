import type { ExposedMeta } from '../shared/type';

/**
 * A naive DI implementation to get rid of circular dependency.
 */

export let exposed: ExposedMeta | undefined;

export const provideExposed = (exposedMeta: ExposedMeta) => {
  exposed = exposedMeta;
};
