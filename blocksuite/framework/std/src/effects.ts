import { GfxViewportElement } from './gfx/viewport-element.js';
import { VElement, VLine, VText } from './inline/index.js';
import { EditorHost } from './view/index.js';

export function effects() {
  // editor host
  customElements.define('editor-host', EditorHost);
  // gfx
  customElements.define('gfx-viewport', GfxViewportElement);
  // inline
  customElements.define('v-element', VElement);
  customElements.define('v-line', VLine);
  customElements.define('v-text', VText);
}
