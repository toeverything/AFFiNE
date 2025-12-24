import { kanbanEffects } from './kanban/effect.js';
import { tableEffects } from './table/effect.js';

export function viewPresetsEffects() {
  kanbanEffects();
  tableEffects();
}
