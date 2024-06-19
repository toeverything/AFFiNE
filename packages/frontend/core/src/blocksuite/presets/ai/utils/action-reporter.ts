import { type ActionEventType, AIProvider } from '../provider';

export function reportResponse(event: ActionEventType) {
  const lastAction = AIProvider.actionHistory.at(-1);
  if (!lastAction) return;

  AIProvider.slots.actions.emit({
    action: lastAction.action,
    options: lastAction.options,
    event,
  });
}
