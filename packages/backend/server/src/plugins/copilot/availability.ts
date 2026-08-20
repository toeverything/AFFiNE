import type { Config } from '../../base/config';
import { ActionForbidden } from '../../base/error/errors.gen';

export function assertCopilotEnabled(config: Config) {
  if (!config.copilot.enabled) {
    throw new ActionForbidden('Copilot is disabled.');
  }
}
