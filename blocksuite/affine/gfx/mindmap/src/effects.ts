import { MindMapPlaceholder } from './toolbar/mindmap-importing-placeholder';
import { EdgelessMindmapMenu } from './toolbar/mindmap-menu';
import { EdgelessMindmapToolButton } from './toolbar/mindmap-tool-button';

export function effects() {
  customElements.define(
    'edgeless-mindmap-tool-button',
    EdgelessMindmapToolButton
  );
  customElements.define('edgeless-mindmap-menu', EdgelessMindmapMenu);
  customElements.define('mindmap-import-placeholder', MindMapPlaceholder);
}

declare global {
  interface HTMLElementTagNameMap {
    'edgeless-mindmap-tool-button': EdgelessMindmapToolButton;
    'edgeless-mindmap-menu': EdgelessMindmapMenu;
    'mindmap-import-placeholder': MindMapPlaceholder;
  }
}
