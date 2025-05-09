import { CheckboxCell } from './checkbox/cell-renderer.js';
import { DateCell } from './date/cell-renderer.js';
import { ImageCell } from './image/cell-renderer.js';
import { MultiSelectCell } from './multi-select/cell-renderer.js';
import { NumberCell } from './number/cell-renderer.js';
import { ProgressCell } from './progress/cell-renderer.js';
import { SelectCell } from './select/cell-renderer.js';
import { TextCell } from './text/cell-renderer.js';

export function propertyPresetsEffects() {
  customElements.define('affine-database-checkbox-cell', CheckboxCell);
  customElements.define('affine-database-date-cell', DateCell);
  customElements.define('affine-database-image-cell', ImageCell);
  customElements.define('affine-database-multi-select-cell', MultiSelectCell);
  customElements.define('affine-database-number-cell', NumberCell);
  customElements.define('affine-database-progress-cell', ProgressCell);
  customElements.define('affine-database-select-cell', SelectCell);
  customElements.define('affine-database-text-cell', TextCell);
}
