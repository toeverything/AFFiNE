import { ensureHelperProcess } from '../helper-process';
import { logger } from '../logger';
import { initMainWindow } from '../main-window';
import { initOnboardingWindow } from '../onboarding';
import { launchStage } from './stage';

// todo: not all window need all of the exposed meta
const getWindowAdditionalArguments = async () => {
  const { getExposedMeta } = await import('../exposed');
  const mainExposedMeta = getExposedMeta();
  const helperProcessManager = await ensureHelperProcess();
  const helperExposedMeta = await helperProcessManager.rpc?.getMeta();
  return [
    `--main-exposed-meta=` + JSON.stringify(mainExposedMeta),
    `--helper-exposed-meta=` + JSON.stringify(helperExposedMeta),
  ];
};

/**
 * Launch app depending on launch stage
 */
export async function launch() {
  const stage = launchStage.value;
  const additionalArguments = await getWindowAdditionalArguments();
  if (stage === 'main') {
    initMainWindow(additionalArguments).catch(e => {
      logger.error('Failed to restore or create window:', e);
    });
  }
  if (stage === 'onboarding') {
    initOnboardingWindow(additionalArguments).catch(e => {
      logger.error('Failed to restore or create onboarding window:', e);
    });
  }
}
