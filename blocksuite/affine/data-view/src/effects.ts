import { coreEffects } from './core/effect.js';
import { propertyPresetsEffects } from './property-presets/effect.js';
import { viewPresetsEffects } from './view-presets/effect.js';
import { widgetPresetsEffects } from './widget-presets/effect.js';

export function effects() {
  coreEffects();
  propertyPresetsEffects();
  viewPresetsEffects();
  widgetPresetsEffects();
}
