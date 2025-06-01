import { kanbanEffects } from './kanban/effect.js';
import { tableEffects } from './table/effect.js';
import { chartEffects } from './chart/effect.js';


export function viewPresetsEffects() {
  kanbanEffects();
  tableEffects();
  chartEffects();
}
