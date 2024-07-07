import { logger } from '../logger';
import { initAndShowMainWindow } from './main-window';
import { getOnboardingWindow, getOrCreateOnboardingWindow } from './onboarding';
import { launchStage } from './stage';

/**
 * Launch app depending on launch stage
 */
export async function launch() {
  const stage = launchStage.value;
  if (stage === 'main') {
    initAndShowMainWindow().catch(e => {
      logger.error('Failed to restore or create window:', e);
    });

    getOnboardingWindow()
      .then(w => w?.destroy())
      .catch(e => logger.error('Failed to destroy onboarding window:', e));
  }
  if (stage === 'onboarding')
    getOrCreateOnboardingWindow().catch(e => {
      logger.error('Failed to restore or create onboarding window:', e);
    });
}
