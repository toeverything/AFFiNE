import { EdgelessGroupTitleEditor } from './text/edgeless-group-title-editor';

export function effects() {
  customElements.define(
    'edgeless-group-title-editor',
    EdgelessGroupTitleEditor
  );
}

declare global {
  interface HTMLElementTagNameMap {
    'edgeless-group-title-editor': EdgelessGroupTitleEditor;
  }
}
