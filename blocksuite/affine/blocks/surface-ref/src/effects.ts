import { SurfaceRefPlaceHolder, SurfaceRefToolbarTitle } from './components';
import { SurfaceRefGenericBlockPortal } from './portal/generic-block';
import { SurfaceRefNotePortal } from './portal/note';
import { SurfaceRefBlockComponent } from './surface-ref-block';
import { EdgelessSurfaceRefBlockComponent } from './surface-ref-block-edgeless';

export function effects() {
  customElements.define(
    'surface-ref-generic-block-portal',
    SurfaceRefGenericBlockPortal
  );
  customElements.define('affine-surface-ref', SurfaceRefBlockComponent);
  customElements.define(
    'affine-edgeless-surface-ref',
    EdgelessSurfaceRefBlockComponent
  );
  customElements.define('surface-ref-note-portal', SurfaceRefNotePortal);
  customElements.define('surface-ref-toolbar-title', SurfaceRefToolbarTitle);
  customElements.define('surface-ref-placeholder', SurfaceRefPlaceHolder);
}
