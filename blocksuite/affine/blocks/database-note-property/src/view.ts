import {
  DatabaseBlockDataSource,
  type PropertyMetaConfig,
} from '@blocksuite/affine-block-database';
import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '@blocksuite/affine-ext-loader';

import {
  attachExistingNoteForRow,
  createNoteForRow,
  revealOrInsertNoteForRow,
} from './actions.js';
import { noteColumnConfig } from './cell-renderer.js';
import { effects } from './effects.js';

// Module-level, not instance-level: `ExtensionManager.get(scope)` rebuilds
// every registered `ViewExtensionProvider` (including a fresh instance of
// this class) on every single call — a documented gotcha of that manager.
// Re-running `setup()`'s signal writes below on every rebuild triggers a
// self-sustaining reactive update loop (each write re-notifies subscribers
// that themselves trigger another `ExtensionManager.get()`), pegging the
// CPU. Since the registration itself is idempotent process-wide (not
// per-doc or per-editor-instance), a plain module-level flag — not
// re-derived from current state — is enough to make it run exactly once.
let registered = false;

// Registers the "Note" database column type from the outside, at runtime —
// `@blocksuite/affine-block-database` itself never imports this package
// (or `@blocksuite/affine-block-note-ref`), since note-ref depends on root,
// which depends back on database; a static import here would close that
// cycle. See `DatabaseBlockDataSource.noteRefRowActions`/`externalProperties`
// for the two registration seams this fills.
export class DatabaseNotePropertyViewExtension extends ViewExtensionProvider {
  override name = 'affine-database-note-property';

  override effect(): void {
    super.effect();
    effects();
  }

  override setup(context: ViewExtensionContext): void {
    super.setup(context);
    if (registered) return;
    registered = true;

    DatabaseBlockDataSource.noteRefRowActions = {
      createNoteForRow,
      revealOrInsertNoteForRow,
      attachExistingNoteForRow,
    };

    // Same generic-narrowing cast `DatabaseBlockDataSource.propertiesList`
    // itself uses when erasing each entry to the common `PropertyMetaConfig`
    // — `noteColumnConfig`'s own value/data type params are always more
    // specific than the array's erased element type.
    const config = noteColumnConfig as unknown as PropertyMetaConfig;
    if (!DatabaseBlockDataSource.externalProperties.value.includes(config)) {
      DatabaseBlockDataSource.externalProperties.value = [
        ...DatabaseBlockDataSource.externalProperties.value,
        config,
      ];
    }
  }
}
