import { ColumnBlockComponent } from './column-block';
import { ColumnsBlockComponent } from './columns-block';
import { EdgelessNoteBackground } from './components/edgeless-note-background';
import { EdgelessNoteBorderDropdownMenu } from './components/edgeless-note-border-dropdown-menu';
import { EdgelessNoteDisplayModeDropdownMenu } from './components/edgeless-note-display-mode-dropdown-menu';
import { EdgelessNoteMask } from './components/edgeless-note-mask';
import { EdgelessNoteShadowMenu } from './components/edgeless-note-shadow-menu';
import { EdgelessNoteStylePanel } from './components/edgeless-note-style-panel';
import { EdgelessPageBlockTitle } from './components/edgeless-page-block-title';
import { NoteBlockComponent } from './note-block';
import {
  AFFINE_EDGELESS_NOTE,
  EdgelessNoteBlockComponent,
} from './note-edgeless-block';

const define = (name: string, element: CustomElementConstructor) => {
  if (!customElements.get(name)) {
    customElements.define(name, element);
  }
};

export function effects() {
  define('affine-note', NoteBlockComponent);
  define('affine-columns', ColumnsBlockComponent);
  define('affine-column', ColumnBlockComponent);
  define(AFFINE_EDGELESS_NOTE, EdgelessNoteBlockComponent);
  define('edgeless-note-mask', EdgelessNoteMask);
  define('edgeless-note-background', EdgelessNoteBackground);
  define('edgeless-page-block-title', EdgelessPageBlockTitle);
  define('edgeless-note-shadow-menu', EdgelessNoteShadowMenu);
  define('edgeless-note-border-dropdown-menu', EdgelessNoteBorderDropdownMenu);
  define(
    'edgeless-note-display-mode-dropdown-menu',
    EdgelessNoteDisplayModeDropdownMenu
  );
  define('edgeless-note-style-panel', EdgelessNoteStylePanel);
}
