import { AIItem } from './ai-item';
import { AIItemList } from './ai-item-list';
import { AISubItemList } from './ai-sub-item-list';

export * from './ai-item-list.js';
export * from './types.js';

export function effects() {
  customElements.define('ai-item-list', AIItemList);
  customElements.define('ai-item', AIItem);
  customElements.define('ai-sub-item-list', AISubItemList);
}
