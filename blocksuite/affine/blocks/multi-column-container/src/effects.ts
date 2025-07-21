import { MultiColumnContainerBlockComponent } from './multi-column-container-block.js';

export function effects() {
  customElements.define(
    'affine-multi-column-container',
    MultiColumnContainerBlockComponent
  );
}
