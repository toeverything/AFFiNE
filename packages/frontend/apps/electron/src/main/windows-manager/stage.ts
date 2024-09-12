import { persistentConfig } from '../config-storage/persist';
import type { LaunchStage } from './types';

export const launchStage: { value: LaunchStage } = {
  value: persistentConfig.get('onBoarding') ? 'onboarding' : 'main',
};
