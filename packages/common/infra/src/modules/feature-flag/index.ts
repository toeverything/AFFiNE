import type { Framework } from '../../framework';
import { GlobalStateService } from '../storage';
import { Flags } from './entities/flags';
import { FeatureFlagService } from './services/feature-flag';

export { AFFINE_FLAGS } from './constant';
export type { Flag } from './entities/flags';
export { FeatureFlagService } from './services/feature-flag';
export type { FlagInfo } from './types';

export function configureFeatureFlagModule(framework: Framework) {
  framework.service(FeatureFlagService).entity(Flags, [GlobalStateService]);
}
