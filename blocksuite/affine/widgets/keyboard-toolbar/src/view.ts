import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '@blocksuite/affine-ext-loader';
import { IS_MOBILE } from '@blocksuite/global/env';

import { effects } from './effects';
import { keyboardToolbarWidget } from './widget';

export class KeyboardToolbarViewExtension extends ViewExtensionProvider {
  override name = 'affine-keyboard-toolbar-widget';

  override effect() {
    super.effect();
    effects();
  }

  override setup(context: ViewExtensionContext) {
    super.setup(context);
    if (
      context.scope === 'mobile-page' ||
      // Legacy mobile page
      (context.scope === 'page' && IS_MOBILE) ||
      // Phase 4 (MOBILE-12, D-06): referenced content rendered by
      // database-ref/database-view-ref (and any other 'preview-page'
      // consumer) builds its own nested `BlockStdScope` over this same
      // 'preview-page' scope — no toolbar instance ever mounted inside it
      // before, which is why Journal Todo/Calendar (registered into the
      // toolbar's own tool group by Phase 2) stayed unreachable in
      // practice. `AffineKeyboardToolbarWidget.render()`'s existing
      // `this.store.readonly` gate is what keeps this scope-wide
      // registration safe for the OTHER 'preview-page' consumers that open
      // their preview `Store` with `readonly: true` (embed-synced-doc-block,
      // surface-ref's note portal) — database-ref/database-view-ref are the
      // only ones that don't, which is exactly why they're the only ones
      // this registration makes the toolbar reachable in. Gated on
      // `IS_MOBILE` like the other two clauses above: 'preview-page' is also
      // built in desktop-only contexts (e.g. desktop's own database-ref
      // preview), and the widget's `connectedCallback()` unconditionally
      // resolves `VirtualKeyboardProvider` (a throwing `std.get`, not
      // `getOptional`) before its own `render()` gate ever gets a chance to
      // bail out on `!IS_MOBILE` — so registering this scope-wide without
      // the `IS_MOBILE` guard would throw "Service [VirtualKeyboardProvider]
      // not found" for every 'preview-page' consumer in any non-mobile
      // context.
      (context.scope === 'preview-page' && IS_MOBILE)
    ) {
      context.register(keyboardToolbarWidget);
    }
  }
}
