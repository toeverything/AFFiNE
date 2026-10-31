import { LiveData, Store, yjsGetPath, yjsObserve } from '@toeverything/infra';
import { switchMap } from 'rxjs';
import { type Doc as YDoc, transact } from 'yjs';

import type { WorkspaceService } from '../../workspace';

export interface JournalTodoDatabaseRef {
  docId: string;
  databaseId: string;
}

const META_KEY = 'journalTodoDatabaseRef';

/**
 * Reads the pointer straight from a workspace root doc, for callers that
 * have the root doc but not this store (e.g. `DocsService`'s duplication
 * transformer, which re-points copied Journal Todo references at it).
 */
export function readJournalTodoDatabaseRef(
  rootYDoc: YDoc
): JournalTodoDatabaseRef | undefined {
  return rootYDoc.getMap('meta').get(META_KEY) as
    | JournalTodoDatabaseRef
    | undefined;
}

/**
 * The single, workspace-wide, Yjs-synced pointer to "the current journal
 * todo database" (Story 2.4) — deliberately *not* `EditorSettingProvider`
 * (confirmed wrong scope: its `impls/global-state.ts`/`impls/user-db.ts`
 * backends are user-local/per-device, which would mean every collaborator
 * resolves to a different "current" database). Mirrors `DocsStore`'s own
 * `rootYDoc.getMap('meta')` access pattern (`modules/doc/stores/docs.ts`)
 * rather than `JournalStore`'s per-doc `properties$` pattern, since this
 * value is genuinely workspace-global, not scoped to any one doc.
 */
export class JournalTodoDatabaseStore extends Store {
  constructor(private readonly workspaceService: WorkspaceService) {
    super();
  }

  private get metaMap() {
    return this.workspaceService.workspace.rootYDoc.getMap('meta');
  }

  journalTodoDatabaseRef$ = LiveData.from(
    yjsGetPath(this.metaMap, META_KEY).pipe(
      switchMap(yjsObserve),
      // yjsGetPath/yjsObserve emit the raw stored value (or undefined if
      // the key was never set) — no further transform needed since we
      // store a plain `{docId, databaseId}` object directly, not a nested
      // Y structure.
      switchMap(value => [value as JournalTodoDatabaseRef | undefined])
    ),
    undefined
  );

  getJournalTodoDatabaseRef(): JournalTodoDatabaseRef | undefined {
    return readJournalTodoDatabaseRef(this.workspaceService.workspace.rootYDoc);
  }

  setJournalTodoDatabaseRef(ref: JournalTodoDatabaseRef | undefined) {
    transact(
      this.workspaceService.workspace.rootYDoc,
      () => {
        if (ref) {
          this.metaMap.set(META_KEY, ref);
        } else {
          this.metaMap.delete(META_KEY);
        }
      },
      { force: true }
    );
  }
}
