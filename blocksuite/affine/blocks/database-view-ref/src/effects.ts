import { DatabaseViewRefBlockComponent } from './database-view-ref-block.js';

export function effects() {
  customElements.define(
    'affine-database-view-ref',
    DatabaseViewRefBlockComponent
  );
}
