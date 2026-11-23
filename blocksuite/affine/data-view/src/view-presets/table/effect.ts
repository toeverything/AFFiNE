import { mobileEffects } from './mobile/effect.js';
import { pcEffects } from './pc/effect.js';
import { pcVirtualEffects } from './pc-virtual/effect.js';
import { statsEffects } from './stats/effect.js';

export function tableEffects() {
  mobileEffects();
  statsEffects();
  pcEffects();
  pcVirtualEffects();
}
