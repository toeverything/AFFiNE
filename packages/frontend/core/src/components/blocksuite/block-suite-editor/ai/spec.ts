import { getAISpecs } from '@blocksuite/presets';

import { setupAIProvider } from './provider';

export function getParsedAISpecs() {
  setupAIProvider();
  return getAISpecs();
}
