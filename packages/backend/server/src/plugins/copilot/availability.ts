import { ActionForbidden } from '../../base/error/errors.gen';

export function assertCopilotEnabled(enabled: boolean) {
  if (!enabled) {
    throw new ActionForbidden('Copilot is disabled.');
  }
}
