import { ganttEffects } from './gantt/effect.js';
import { kanbanEffects } from './kanban/effect.js';
import { tableEffects } from './table/effect.js';

export function viewPresetsEffects() {
  ganttEffects();
  kanbanEffects();
  tableEffects();
}
