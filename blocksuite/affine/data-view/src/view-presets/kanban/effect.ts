import { mobileEffects } from './mobile/effect.js';
import { pcEffects } from './pc/effect.js';

export function kanbanEffects() {
  pcEffects();
  mobileEffects();
}
