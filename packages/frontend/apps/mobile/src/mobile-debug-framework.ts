/**
 * Debug/E2E-only: publishes this app's live DI `FrameworkProvider` on
 * `window` so a Playwright `page.evaluate` (or a `mobile-debug-eval`
 * snippet) can reach real services instead of only the DOM.
 *
 * Why this exists: a few workspace-level settings have no mobile UI at all
 * — `journalTemplateId` / `pageTemplateId` are written only from
 * `desktop/dialogs/setting/workspace-setting/preference/template.tsx` and
 * `desktop/pages/workspace/detail-page/tabs/journal/*`, none of which are
 * in the mobile bundle's router. They live in the workspace userdata DB
 * (an ORM over Yjs, `WorkspaceDBService`), so they can't be seeded from
 * outside the app either, and the desktop shell can't be used to seed them
 * because it runs on a different port, i.e. a different origin with its
 * own IndexedDB. Without a handle like this, any mobile E2E test of a
 * template-driven flow (e.g. "create today's journal from the journal
 * template") simply cannot be set up.
 *
 * Same family and lifetime as `mobile-debug-log.ts` /
 * `mobile-debug-eval.ts`, but unlike those this one IS gated: it is only
 * installed when `BUILD_CONFIG.debug` is set, so production builds expose
 * nothing.
 */

import { DocsService } from '@affine/core/modules/doc';
import { JournalService } from '@affine/core/modules/journal';
import { TemplateDocService } from '@affine/core/modules/template-doc';
import { WorkspacesService } from '@affine/core/modules/workspace';
import { insertJournalTodoReference } from '@blocksuite/affine/blocks/database-view-ref';
import type { FrameworkProvider } from '@toeverything/infra';

/**
 * `FrameworkProvider.get()` is keyed by the service *class* itself (e.g.
 * `provider.get(LifecycleService)`), which a `page.evaluate` callback has
 * no way to reference — the bundle exports nothing to the page. So the
 * handful of classes a test legitimately needs are published alongside the
 * provider rather than expecting the caller to conjure the identifiers.
 */
export interface MobileDebugFrameworkHandle {
  provider: FrameworkProvider;
  /**
   * The exact function the mobile keyboard toolbar's own "Journal Todo"
   * button calls (`keyboard-toolbar/src/config.ts:980`). Exposed because
   * that button is only reachable once the toolbar is up, which needs a real
   * virtual keyboard — `VirtualKeyboardProvider` here is
   * `createVisualViewportVirtualKeyboardProvider()`, driven by
   * `visualViewport` resize events that headless mobile emulation never
   * fires. The mobile web shell also renders no `affine-slash-menu-widget`
   * at all, so the desktop suite's `/Journal Todo` typing route does not
   * exist here either. Calling the production function directly keeps a
   * mobile E2E faithful to what the button does, without needing an OS
   * keyboard.
   */
  insertJournalTodoReference: typeof insertJournalTodoReference;
  services: {
    DocsService: typeof DocsService;
    JournalService: typeof JournalService;
    TemplateDocService: typeof TemplateDocService;
    WorkspacesService: typeof WorkspacesService;
  };
}

declare global {
  interface Window {
    /** Only present in debug builds — see `installMobileDebugFrameworkHandle`. */
    __affineDebugFramework?: MobileDebugFrameworkHandle;
  }
}

export function installMobileDebugFrameworkHandle(
  frameworkProvider: FrameworkProvider
) {
  if (!BUILD_CONFIG.debug) {
    return;
  }
  window.__affineDebugFramework = {
    provider: frameworkProvider,
    insertJournalTodoReference,
    services: {
      DocsService,
      JournalService,
      TemplateDocService,
      WorkspacesService,
    },
  };
}
