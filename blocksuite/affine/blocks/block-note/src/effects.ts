import { EdgelessNoteBackground } from './components/edgeless-note-background';
import { EdgelessNoteBorderDropdownMenu } from './components/edgeless-note-border-dropdown-menu';
import { EdgelessNoteDisplayModeDropdownMenu } from './components/edgeless-note-display-mode-dropdown-menu';
import { EdgelessNoteMask } from './components/edgeless-note-mask';
import { EdgelessNoteShadowDropdownMenu } from './components/edgeless-note-shadow-dropdown-menu';
import { EdgelessPageBlockTitle } from './components/edgeless-page-block-title';
import { NoteBlockComponent } from './note-block';
import {
  AFFINE_EDGELESS_NOTE,
  EdgelessNoteBlockComponent,
} from './note-edgeless-block';

export function effects() {
  customElements.define('affine-note', NoteBlockComponent);
  customElements.define(AFFINE_EDGELESS_NOTE, EdgelessNoteBlockComponent);
  customElements.define('edgeless-note-mask', EdgelessNoteMask);
  customElements.define('edgeless-note-background', EdgelessNoteBackground);
  customElements.define('edgeless-page-block-title', EdgelessPageBlockTitle);
  customElements.define(
    'edgeless-note-shadow-dropdown-menu',
    EdgelessNoteShadowDropdownMenu
  );
  customElements.define(
    'edgeless-note-border-dropdown-menu',
    EdgelessNoteBorderDropdownMenu
  );
  customElements.define(
    'edgeless-note-display-mode-dropdown-menu',
    EdgelessNoteDisplayModeDropdownMenu
  );
}
