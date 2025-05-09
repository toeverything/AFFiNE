import { MiniMindmapPreview } from './mindmap-preview.js';
import { MindmapRootBlock } from './mindmap-root-block.js';
import { MindmapSurfaceBlock } from './surface-block.js';

export { markdownToMindmap, MiniMindmapPreview } from './mindmap-preview.js';
export { MindmapRootBlock } from './mindmap-root-block.js';
export { MindmapService } from './mindmap-service.js';
export { MindmapSurfaceBlock } from './surface-block.js';

export function registerMiniMindmapBlocks() {
  customElements.define('mini-mindmap-root-block', MindmapRootBlock);
  customElements.define('mini-mindmap-preview', MiniMindmapPreview);
  customElements.define('mini-mindmap-surface-block', MindmapSurfaceBlock);
}
