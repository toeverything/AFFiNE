import { EdgelessTextEditor } from './edgeless-text-editor';
import { EdgelessTextMenu } from './toolbar/text-menu';

export function effects() {
  customElements.define('edgeless-text-editor', EdgelessTextEditor);
  customElements.define('edgeless-text-menu', EdgelessTextMenu);
}

declare global {
  interface HTMLElementTagNameMap {
    'edgeless-text-editor': EdgelessTextEditor;
    'edgeless-text-menu': EdgelessTextMenu;
  }
}
