import { NoteCell } from './cell-renderer.js';

export function effects() {
  customElements.define('affine-database-note-cell', NoteCell);
}
