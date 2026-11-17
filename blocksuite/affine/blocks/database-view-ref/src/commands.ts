import {
  DatabaseBlockDataSource,
  DatabaseViewLocalOverrideProvider,
} from '@blocksuite/affine-block-database';
import { ensurePromoted } from '@blocksuite/affine-block-database-ref';
import { toast } from '@blocksuite/affine-components/toast';
import type {
  DatabaseBlockModel,
  DatabaseViewRefBlockModel,
  DatabaseViewRefProps,
} from '@blocksuite/affine-model';
import {
  ensureDocLoaded,
  waitForBlockInDoc,
} from '@blocksuite/affine-shared/utils';
import {
  type BasicViewDataType,
  EditorHostKey,
  type FilterGroup,
} from '@blocksuite/data-view';
import type { BlockStdScope, Command } from '@blocksuite/std';
import type { BlockModel } from '@blocksuite/store';

import { createLocalViewOverride } from './view-override.js';

export interface SeedInitialViewOptions {
  /** Defaults to `'table'`, matching this function's pre-existing behavior. */
  viewType?: string;
  /** Merged into the newly-created view's `filter` field, if provided. */
  initialFilter?: FilterGroup;
}

/**
 * Seeds a freshly created `affine:database-view-ref` with one default view
 * of its own — mirrors how a freshly created `affine:database` itself
 * always starts with one view, but writes into this reference's own local
 * `views` (via `DatabaseViewLocalOverrideProvider`) instead of the
 * canonical's. Deliberately does *not* reuse `databaseViewInitTemplate`
 * (`blocks/database/src/data-source.ts`) — that also adds rows/properties/
 * task-workflow columns, which only makes sense for a brand-new, empty
 * database, not a reference to an already-populated canonical.
 *
 * `options` defaults to today's exact pre-existing behavior (`'table'`, no
 * filter) — additive only, so every existing caller (this file's own
 * `insertDatabaseViewRefBlockCommand`, called with no extra args) is
 * unaffected. Story 2.4's own Journal Todo command is the first caller to
 * pass `{ viewType: 'list', initialFilter }`.
 */
function seedInitialView(
  std: BlockStdScope,
  refModel: DatabaseViewRefBlockModel,
  canonicalModel: DatabaseBlockModel,
  options?: SeedInitialViewOptions
) {
  const override = createLocalViewOverride(refModel);
  const dataSource = new DatabaseBlockDataSource(canonicalModel, ds => {
    ds.serviceSet(DatabaseViewLocalOverrideProvider, override);
    // Without this, `hideDefaultHiddenColumnsForNewView`'s internal
    // `this.serviceGet(EditorHostKey)?.std` resolution (Story 2.7 —
    // `showDueDateColumn`) silently falls back to the schema default
    // (hidden) for every view seeded through this path, regardless of the
    // live setting — confirmed live: toggling the setting had no effect on
    // a freshly-created "Journal Todo" list precisely because this
    // throwaway `DatabaseBlockDataSource` never had `EditorHostKey` set at
    // all, unlike the real `database-block.ts`-constructed one used for
    // actual rendering.
    ds.serviceSet(EditorHostKey, std.host);
  });
  const id = dataSource.viewManager.viewAdd(options?.viewType ?? 'table');
  if (options?.initialFilter) {
    dataSource.viewDataUpdate<
      BasicViewDataType<string, { filter: FilterGroup }>
    >(id, () => ({ filter: options.initialFilter as FilterGroup }));
  }
}

export const insertDatabaseViewRefBlockCommand: Command<
  {
    refBlockId: string;
    place: 'after' | 'before';
    removeEmptyLine?: boolean;
    selectedModels?: BlockModel[];
    // Set for a cross-doc reference: the target database already lives in
    // its own doc, so no promotion/move is needed. Unset defaults to the
    // current doc — mirrors `insertDatabaseRefBlockCommand` exactly.
    refDocId?: string;
    // Threaded straight through to `seedInitialView` — see
    // `SeedInitialViewOptions`. Omitted entirely by every caller except
    // Story 2.4's own Journal Todo command.
    initialView?: SeedInitialViewOptions;
  },
  {
    insertedDatabaseViewRefBlockId: string;
  }
> = (ctx, next) => {
  const {
    selectedModels,
    refBlockId,
    place,
    removeEmptyLine,
    refDocId,
    initialView,
    std,
  } = ctx;
  if (!selectedModels?.length) return;

  const targetModel =
    place === 'before'
      ? selectedModels[0]
      : selectedModels[selectedModels.length - 1];

  const store = std.store;
  const isCrossDoc = !!refDocId && refDocId !== store.id;

  if (isCrossDoc) {
    // Unlike the same-doc case, the target doc may not have finished
    // loading its content locally yet — mirrors
    // `insertDatabaseRefBlockCommand`'s cross-doc branch exactly (trusts
    // the caller, verifies in the background post-insertion instead of
    // requiring synchronous resolvability).
    const refDoc = std.workspace.getDoc(refDocId);
    if (!refDoc) {
      console.error(`referenced doc not found ${refDocId}`);
      return;
    }
    ensureDocLoaded(refDoc);
  } else {
    const targetBlock = store.getBlock(refBlockId)?.model;
    if (!targetBlock || targetBlock.flavour !== 'affine:database') {
      console.error(`referenced database block not found ${refBlockId}`);
      return;
    }
  }

  store.captureSync();

  if (!isCrossDoc) {
    const targetBlock = store.getBlock(refBlockId)?.model;
    if (targetBlock) ensurePromoted(store, targetBlock);
  }

  const databaseViewRefProps: Partial<DatabaseViewRefProps> & {
    flavour: 'affine:database-view-ref';
  } = {
    flavour: 'affine:database-view-ref',
    refBlockId,
    refDocId: refDocId ?? store.id,
    views: [],
  };

  const result = store.addSiblingBlocks(
    targetModel,
    [databaseViewRefProps],
    place
  );
  if (result.length === 0) return;

  if (!isCrossDoc) {
    // Same-doc: the canonical is guaranteed to already be loaded (we just
    // read it above), so the seed can run synchronously right away.
    const refModel = store.getBlock(result[0])?.model as
      | DatabaseViewRefBlockModel
      | undefined;
    const canonicalModel = store.getBlock(refBlockId)?.model as
      | DatabaseBlockModel
      | undefined;
    if (refModel && canonicalModel) {
      seedInitialView(std, refModel, canonicalModel, initialView);
    }
  }

  if (removeEmptyLine && targetModel.text?.length === 0) {
    store.deleteBlock(targetModel);
  }

  if (isCrossDoc) {
    // Trusts the picker's candidate rather than validating it exists
    // synchronously (see the comment above) — verifies in the background
    // instead, and surfaces a toast if a stale/deleted candidate never
    // actually materializes. Also seeds the initial view here, once the
    // canonical is confirmed to actually exist.
    const refDoc = std.workspace.getDoc(refDocId);
    if (refDoc) {
      waitForBlockInDoc(refDoc, refBlockId)
        .then(found => {
          const canonicalModel = found
            ? (refDoc.getStore({ id: refDoc.id }).getBlock(refBlockId)
                ?.model as DatabaseBlockModel | undefined)
            : undefined;
          if (!found || canonicalModel?.flavour !== 'affine:database') {
            toast(std.host, 'The referenced table could not be found.');
            return;
          }
          const refModel = store.getBlock(result[0])?.model as
            | DatabaseViewRefBlockModel
            | undefined;
          if (refModel) {
            seedInitialView(std, refModel, canonicalModel, initialView);
          }
        })
        .catch(() => {
          // best-effort verification only; insertion already succeeded
        });
    }
  }

  next({
    insertedDatabaseViewRefBlockId: result[0],
  });
};
