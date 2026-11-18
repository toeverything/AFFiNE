import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '@blocksuite/affine/ext-loader';
import {
  FeatureFlagService,
  VirtualKeyboardProvider,
} from '@blocksuite/affine/shared/services';
import type { Container } from '@blocksuite/global/di';
import { LifeCycleWatcher } from '@blocksuite/std';
import type { ExtensionType, Store } from '@blocksuite/store';
import { signal } from '@preact/signals-core';

import { getTestViewManager } from '../../view.js';

// Story 2.12: this package's own `setupEditor` harness never previously
// exercised any `IS_MOBILE`-true render path (RESEARCH.md Wave 0 Gaps --
// "zero existing automated coverage for IS_MOBILE/touch code paths"), so it
// never needed to provide `VirtualKeyboardProvider`.
// `AffineKeyboardToolbarWidget` (blocksuite/affine/widgets/keyboard-toolbar)
// unconditionally resolves that service in `connectedCallback`, regardless
// of the widget's own `IS_MOBILE`-gated `render()` early-return, so any
// IS_MOBILE-true test run throws "Service [VirtualKeyboardProvider] not
// found in container" unless one is registered. Mirrors
// `packages/frontend/core`'s own `KeyboardToolbarExtension` wiring shape
// (a `LifeCycleWatcher` + `di.addImpl`), stubbed down to a no-op since none
// of this phase's specs exercise the keyboard toolbar itself -- this is
// test-harness-only plumbing, not a production code change.
export function createStubVirtualKeyboardExtension(): ExtensionType {
  class StubVirtualKeyboardService extends LifeCycleWatcher {
    static override key = VirtualKeyboardProvider.identifierName;

    readonly visible$ = signal(false);
    readonly height$ = signal(0);
    readonly staticHeight$ = signal(0);
    readonly appTabSafeArea$ = signal('0px');

    show() {}

    hide() {}

    static override setup(di: Container) {
      super.setup(di);
      di.addImpl(VirtualKeyboardProvider, provider => provider.get(this));
    }
  }

  return StubVirtualKeyboardService as unknown as ExtensionType;
}

// Phase 4 (MOBILE-12): `KeyboardToolbarViewExtension` now also registers its
// widget for the 'preview-page' scope — the scope `database-ref`/
// `database-view-ref` (and every other 'preview-page' consumer) use to build
// their own *nested* `BlockStdScope`. That nested scope always resolves
// `ViewExtensionManagerIdentifier` back to this package's own shared
// `getTestViewManager()` singleton (`ViewExtensionManager.get()`'s own
// `selfExtension`) and reruns every *registered provider*'s `setup()` fresh
// for that scope (`ext-loader/src/manager.ts`'s `_build`) — completely
// decoupled from whatever extra items `createEditor` (`setup.ts`) appended
// directly into one specific editor's own `pageSpecs`/`edgelessSpecs` array.
// `createStubVirtualKeyboardExtension()` alone is therefore invisible to a
// nested preview scope: the widget's `connectedCallback` unconditionally
// resolves `VirtualKeyboardProvider` via a throwing `std.get` (not
// `getOptional`) before its own `render()` gate ever runs, so any spec that
// mounts real referenced content and doesn't also register this would throw
// "Service [VirtualKeyboardProvider] not found" the moment focus (or just
// mounting, depending on the consumer) reaches the nested scope.
//
// The fix: register a real, scope-agnostic `ViewExtensionProvider` directly
// with the shared manager — mirroring how the real app's own
// `MobileViewExtension` (`packages/frontend/core`) registers
// `KeyboardToolbarExtension` with no scope filter at all, rather than
// per-scope. `ExtensionManager` (`ext-loader/src/manager.ts`) has no public
// "add a provider after construction" API (only `.get(scope)`/
// `.configure(...)`), so this reaches into the singleton's private
// `_providers` Set — the only way to extend it from a test file without
// editing `view.ts` itself (a stable, minimal shim every other test in this
// suite also depends on).
//
// Registration is paired with `unregisterStubVirtualKeyboardProviderForAllScopes`
// rather than left permanently active: `vitest.mobile.config.ts` sets
// `isolate: false`, so this module's state is shared by every spec file in
// the process, and `_providers` belongs to one shared manager singleton too
// — if this stayed registered forever, a *later* spec file that manually
// passes `createStubVirtualKeyboardExtension()` into `setupEditor`'s own
// `extensions` array (the pre-existing, non-nested-scope pattern every other
// file in this suite uses) would double-register `VirtualKeyboardProvider`
// for the outer 'page'/'mobile-page' scope and throw
// `DuplicateServiceDefinitionError`. Callers register in their own
// `beforeEach` and unregister in the matching per-test teardown, so no other
// spec file in this shared process ever observes this provider active.
let virtualKeyboardProviderRegisteredForAllScopes = false;

class StubVirtualKeyboardViewExtension extends ViewExtensionProvider {
  override name = 'stub-virtual-keyboard-provider-all-scopes';

  override setup(context: ViewExtensionContext) {
    super.setup(context);
    context.register(createStubVirtualKeyboardExtension());
  }
}

function getViewManagerProviders() {
  return (
    getTestViewManager() as unknown as {
      _providers: Set<typeof ViewExtensionProvider>;
    }
  )._providers;
}

export function registerStubVirtualKeyboardProviderForAllScopes() {
  if (virtualKeyboardProviderRegisteredForAllScopes) return;
  virtualKeyboardProviderRegisteredForAllScopes = true;
  getViewManagerProviders().add(StubVirtualKeyboardViewExtension);
}

export function unregisterStubVirtualKeyboardProviderForAllScopes() {
  if (!virtualKeyboardProviderRegisteredForAllScopes) return;
  virtualKeyboardProviderRegisteredForAllScopes = false;
  getViewManagerProviders().delete(StubVirtualKeyboardViewExtension);
}

export function touchTap(target: HTMLElement) {
  const rect = target.getBoundingClientRect();
  const clientX = rect.left + rect.width / 2;
  const clientY = rect.top + rect.height / 2;
  const opts = {
    clientX,
    clientY,
    bubbles: true,
    pointerId: 1,
    isPrimary: true,
    pointerType: 'touch',
  };
  target.dispatchEvent(new PointerEvent('pointerdown', opts));
  target.dispatchEvent(new PointerEvent('pointerup', opts));
  target.dispatchEvent(
    new MouseEvent('click', { clientX, clientY, bubbles: true })
  );
}

export function isVisible(el: HTMLElement | null) {
  if (!el) return false;
  const style = getComputedStyle(el);
  return style.visibility !== 'hidden' && style.opacity !== '0';
}

// New finding this session (not in RESEARCH.md/UI-SPEC.md): a database's
// own `readonly$` already ANDs in `IS_MOBILE && !getFlag(
// 'enable_mobile_database_editing')` (`blocksuite/affine/blocks/database/
// src/data-source.ts` `DatabaseBlockDataSource.readonly$`) -- mobile
// database *writes* are opt-in, defaulting to `false` at the blocksuite
// flag level (`blocksuite/affine/shared/src/services/feature-flag-
// service.ts`'s own `enable_mobile_database_editing: false`), which is
// exactly why `renderDragHandle`'s existing `view.readonly$.value` gate
// correctly omits the handle by default under a bare `IS_MOBILE` context
// -- both here in this blocksuite-only integration-test harness (no
// `packages/frontend/core` in the loop) and, independently, in the real
// AFFiNE app prior to Phase 02. As of Phase 02, the *app-level* default
// (`packages/frontend/core/src/modules/feature-flag/constant.ts`, which
// real users go through) flipped to `true`; that app-level flip has no
// effect on this file's blocksuite-level default, so the behavior
// documented here is still accurate for this test harness. This is a
// pre-existing, deliberate product decision this phase must not touch --
// but a spec that wants to exercise the *writable* mobile path (to prove
// the handle's CSS-visibility fix, not its JS gate) must opt in the same
// way a real device with the setting enabled would.
export function enableMobileDatabaseEditing(store: Store) {
  store.get(FeatureFlagService).setFlag('enable_mobile_database_editing', true);
}
