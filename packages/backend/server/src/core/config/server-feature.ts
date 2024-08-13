import { ServerFeature } from './types';

export const ENABLED_FEATURES: Set<ServerFeature> = new Set();
export function ADD_ENABLED_FEATURES(feature: ServerFeature) {
  ENABLED_FEATURES.add(feature);
}
export { ServerFeature };
