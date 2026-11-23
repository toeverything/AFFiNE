import type { ActionEventType } from '../provider';
import { getAIRequestService } from '../runtime/request';

export function reportResponse(event: ActionEventType, host?: unknown) {
  getAIRequestService().reportLastAction(event, host);
}
