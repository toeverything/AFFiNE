import { EdgelessShapeColorPicker } from './color-picker';

export * from './color-picker';

export function effects() {
  customElements.define(
    'edgeless-shape-color-picker',
    EdgelessShapeColorPicker
  );
}
