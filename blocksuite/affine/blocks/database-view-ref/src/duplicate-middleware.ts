import { DatabaseBlockDataSource } from '@blocksuite/affine-block-database';
import {
  DatabaseBlockModel,
  DatabaseViewRefBlockModel,
} from '@blocksuite/affine-model';
import {
  ensureDocLoaded,
  waitForBlockInDoc,
  waitForDocInWorkspace,
} from '@blocksuite/affine-shared/utils';
import type { Filter, FilterGroup } from '@blocksuite/data-view';
import type {
  AfterImportBlockPayload,
  Store,
  TransformerMiddleware,
  Workspace,
} from '@blocksuite/store';
import { filter as rxFilter, map } from 'rxjs';

type ViewColumn = { id: string; hide?: boolean } & Record<string, unknown>;
type ViewWithFilter = {
  id: string;
  name: string;
  mode: string;
  filter?: FilterGroup;
  columns?: ViewColumn[];
} & Record<string, unknown>;

function rewriteDoneDateLiteral(
  node: Filter,
  doneDateColumnId: string,
  nowMs: number
): { node: Filter; changed: boolean } {
  if (node.type === 'group') {
    let changed = false;
    const conditions = node.conditions.map(child => {
      const result = rewriteDoneDateLiteral(child, doneDateColumnId, nowMs);
      if (result.changed) changed = true;
      return result.node;
    });
    return changed
      ? { node: { ...node, conditions }, changed: true }
      : { node, changed: false };
  }
  if (
    node.function === 'after' &&
    node.left.type === 'ref' &&
    node.left.name === doneDateColumnId
  ) {
    return {
      node: { ...node, args: [{ type: 'literal', value: nowMs - 1 }] },
      changed: true,
    };
  }
  return { node, changed: false };
}

/**
 * Re-points every `isNotOneOf` condition on `statusColumnId` at the
 * canonical's CURRENT 'done' option id.
 *
 * Story 2.11 (live bug, third follow-up): the first clause of the Journal
 * Todo filter is `status isNotOneOf [<done option id>]`, and that id is baked
 * in as a literal when the filter is authored. `rewriteDoneDateLiteral` only
 * ever touched the done-DATE literal, so if the canonical's 'done' option id
 * no longer matches the one frozen into the template, done rows stop matching
 * this clause, it evaluates TRUE, and every previously-completed task stays
 * visible no matter how correct the date cutoff is.
 */
function rewriteDoneOptionLiteral(
  node: Filter,
  statusColumnId: string,
  doneOptionId: string
): { node: Filter; changed: boolean } {
  if (node.type === 'group') {
    let changed = false;
    const conditions = node.conditions.map(child => {
      const result = rewriteDoneOptionLiteral(
        child,
        statusColumnId,
        doneOptionId
      );
      if (result.changed) changed = true;
      return result.node;
    });
    return changed
      ? { node: { ...node, conditions }, changed: true }
      : { node, changed: false };
  }
  if (
    node.function === 'isNotOneOf' &&
    node.left.type === 'ref' &&
    node.left.name === statusColumnId
  ) {
    const current = node.args[0];
    const alreadyCorrect =
      current?.type === 'literal' &&
      Array.isArray(current.value) &&
      current.value.length === 1 &&
      current.value[0] === doneOptionId;
    if (alreadyCorrect) return { node, changed: false };
    return {
      node: { ...node, args: [{ type: 'literal', value: [doneOptionId] }] },
      changed: true,
    };
  }
  return { node, changed: false };
}

/** Whether `node` already contains an `after` condition on `columnId`. */
function hasDoneDateClause(node: Filter, columnId: string): boolean {
  if (node.type === 'group') {
    return node.conditions.some(child => hasDoneDateClause(child, columnId));
  }
  return (
    node.function === 'after' &&
    node.left.type === 'ref' &&
    node.left.name === columnId
  );
}

/** The grace clause exactly as a fresh `/Journal Todo` insertion builds it. */
function buildDoneDateClause(doneDateColumnId: string, nowMs: number): Filter {
  return {
    type: 'filter',
    left: { type: 'ref', name: doneDateColumnId },
    function: 'after',
    args: [{ type: 'literal', value: nowMs - 1 }],
  } as Filter;
}

/**
 * Ensures `columnId` has a `hide: true` entry in this one view's own
 * `columns` array — the same effect `DatabaseBlockDataSource`'s private
 * `hidePropertyInOneView` produces, reimplemented directly against a
 * plain `view` snapshot rather than through a live `DataSource`/
 * `ViewManager`, since this runs during duplication against a freshly
 * -imported model that isn't wired into any rendered view yet.
 */
function hideColumnInView(
  view: ViewWithFilter,
  columnId: string
): { view: ViewWithFilter; changed: boolean } {
  const columns = view.columns ?? [];
  const idx = columns.findIndex(c => c.id === columnId);
  if (idx >= 0) {
    if (columns[idx]?.hide === true) {
      return { view, changed: false };
    }
    const nextColumns = [...columns];
    nextColumns[idx] = { ...nextColumns[idx], id: columnId, hide: true };
    return { view: { ...view, columns: nextColumns }, changed: true };
  }
  const entry: ViewColumn =
    view.mode === 'table'
      ? { id: columnId, width: 180, hide: true }
      : { id: columnId, hide: true };
  return { view: { ...view, columns: [...columns, entry] }, changed: true };
}

/** The workspace-wide Journal Todo source, as `JournalTodoDatabaseProvider` holds it. */
export interface JournalTodoSourceRef {
  refDocId: string;
  refBlockId: string;
}

/**
 * Whether a view carries the Journal Todo filter a `/Journal Todo`
 * insertion seeds: an `or` group with a "status is not done" clause and a
 * "done after <cutoff>" grace clause. That shape is what tells a Journal
 * Todo reference apart from a generic database reference (Story 2.5),
 * which must never be re-pointed.
 */
function isJournalTodoView(view: ViewWithFilter): boolean {
  const filter = view.filter;
  if (!filter || filter.type !== 'group' || filter.op !== 'or') return false;
  const fns = new Set(
    filter.conditions.map(c => (c.type === 'filter' ? c.function : undefined))
  );
  return fns.has('isNotOneOf') && fns.has('after');
}

/** Replaces every string leaf of `value` found in `idMap`. */
function remapIds(value: unknown, idMap: Map<string, string>): unknown {
  if (typeof value === 'string') return idMap.get(value) ?? value;
  if (Array.isArray(value)) return value.map(item => remapIds(item, idMap));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, remapIds(item, idMap)])
    );
  }
  return value;
}

async function resolveDatabase(
  workspace: Workspace,
  docId: string,
  blockId: string,
  currentStore: Store
): Promise<DatabaseBlockModel | null> {
  let doc = workspace.getDoc(docId);
  if (!doc) {
    if (!(await waitForDocInWorkspace(workspace, docId))) return null;
    doc = workspace.getDoc(docId);
    if (!doc) return null;
  }
  const store =
    doc === currentStore.doc ? currentStore : doc.getStore({ id: doc.id });
  if (!store.getBlock(blockId)) {
    ensureDocLoaded(doc);
    if (!(await waitForBlockInDoc(doc, blockId))) return null;
  }
  const model = store.getBlock(blockId)?.model;
  return model instanceof DatabaseBlockModel ? model : null;
}

/**
 * Re-points a duplicated Journal Todo reference at `current`, the source
 * table in use NOW. Its views are kept (the template's view settings), with
 * every column id of the table it was copied against swapped for the
 * same-named column of the current table. If the old table can't be
 * resolved, the filters are dropped instead, and `applyJournalTodoRefresh`
 * installs a fresh Journal Todo filter.
 */
function repointJournalTodoReference(
  model: DatabaseViewRefBlockModel,
  current: JournalTodoSourceRef,
  previousTable: DatabaseBlockModel | null,
  currentTable: DatabaseBlockModel
) {
  // The same columns a fresh `/Journal Todo` insertion ensures.
  const dataSource = new DatabaseBlockDataSource(currentTable);
  dataSource.ensureTaskStatusColumn();
  dataSource.ensureDoneDateColumn();
  dataSource.ensureNoteColumn();

  let views = JSON.parse(JSON.stringify(model.props.views)) as ViewWithFilter[];
  if (previousTable) {
    const currentIdByName = new Map(
      currentTable.props.columns.map(column => [column.name, column.id])
    );
    const idMap = new Map<string, string>();
    for (const column of previousTable.props.columns) {
      const currentId = currentIdByName.get(column.name);
      if (currentId && currentId !== column.id) idMap.set(column.id, currentId);
    }
    views = remapIds(views, idMap) as ViewWithFilter[];
  } else {
    views = views.map(view => ({ ...view, filter: undefined }));
  }

  model.store.transact(() => {
    model.props.refDocId = current.refDocId;
    model.props.refBlockId = current.refBlockId;
    model.props.views = views as typeof model.props.views;
  });
}

/**
 * Applies the actual grace-window-filter-rewrite + Note-color-column-hide
 * fix against a resolved canonical `DatabaseBlockModel`. Extracted so both
 * the synchronous fast path (canonical already resolvable) and the async
 * retry path (canonical's host doc had to be loaded first) share byte-
 * identical logic.
 */
function applyJournalTodoRefresh(
  model: DatabaseViewRefBlockModel,
  canonicalModel: DatabaseBlockModel
) {
  const dataSource = new DatabaseBlockDataSource(canonicalModel);
  const doneDateColumnId = dataSource.getDoneDateColumn()?.id;
  const noteColorColumnId = dataSource.getNoteColorColumn()?.id;
  const statusColumnId = dataSource.getTaskStatusColumn()?.id;
  const doneOptionId = statusColumnId
    ? dataSource.getTaskStatusTargetOption('done', statusColumnId)?.id
    : undefined;
  if (!doneDateColumnId && !noteColorColumnId) return;

  const nowMs = Date.now();
  const views = model.props.views as ViewWithFilter[];
  let anyChanged = false;
  const nextViews = views.map(view => {
    let current = view;

    if (doneDateColumnId && current.filter) {
      // Kept in step with `current.filter`: reassigning `current` below
      // would otherwise drop TypeScript's narrowing of `current.filter`.
      let filter: FilterGroup = current.filter;
      const result = rewriteDoneDateLiteral(filter, doneDateColumnId, nowMs);
      if (result.changed) {
        filter = result.node as FilterGroup;
        current = { ...current, filter };
        anyChanged = true;
      }

      // Story 2.11 (third follow-up) — re-point the status clause at the
      // canonical's CURRENT 'done' option id. See
      // `rewriteDoneOptionLiteral`.
      if (statusColumnId && doneOptionId) {
        const optionResult = rewriteDoneOptionLiteral(
          filter,
          statusColumnId,
          doneOptionId
        );
        if (optionResult.changed) {
          filter = optionResult.node as FilterGroup;
          current = { ...current, filter };
          anyChanged = true;
        }
      }

      // ...and add the grace clause if it is missing entirely. Only safe to
      // append into a top-level `or` group: appending into an `and` group
      // would narrow the filter rather than widen it, changing semantics the
      // user may have set deliberately.
      if (
        filter.type === 'group' &&
        filter.op === 'or' &&
        !hasDoneDateClause(filter, doneDateColumnId)
      ) {
        current = {
          ...current,
          filter: {
            ...filter,
            conditions: [
              ...filter.conditions,
              buildDoneDateClause(doneDateColumnId, nowMs),
            ],
          } as FilterGroup,
        };
        anyChanged = true;
      }
    } else if (doneDateColumnId && statusColumnId && doneOptionId) {
      // Story 2.11 (third follow-up) — GAP: a duplicated view that arrived
      // with NO filter at all was previously left completely untouched,
      // because the rewrite above is guarded on `current.filter` existing. A
      // filterless Journal Todo view shows EVERY row, including every
      // previously-completed task, forever. A view reaches that state by a
      // user clearing the filter, by predating the grace clause, or via an
      // insertion path that never built one.
      //
      // Install exactly what a fresh `/Journal Todo` insertion would have
      // produced at this moment (see `insertJournalTodoReference` in
      // `configs/slash-menu.ts`), which is what this middleware's contract
      // already claims to guarantee. Requires BOTH the status column and the
      // 'done' option to be resolvable — installing the grace clause alone
      // would hide every *undone* task, since those have no done date.
      current = {
        ...current,
        filter: {
          type: 'group',
          op: 'or',
          conditions: [
            {
              type: 'filter',
              left: { type: 'ref', name: statusColumnId },
              function: 'isNotOneOf',
              args: [{ type: 'literal', value: [doneOptionId] }],
            },
            buildDoneDateClause(doneDateColumnId, nowMs),
          ],
        } as unknown as FilterGroup,
      };
      anyChanged = true;
    }

    if (noteColorColumnId) {
      const result = hideColumnInView(current, noteColorColumnId);
      if (result.changed) {
        current = result.view;
        anyChanged = true;
      }
    }

    return current;
  });
  if (anyChanged) {
    model.props.views = nextViews;
  }
}

/**
 * Story 2.11 (live bug, resolved after two earlier attempts — see
 * `journalTodoDatabaseSlashMenuConfig`'s own comment in
 * `configs/slash-menu.ts` for the full history before changing this
 * again): the Journal Todo grace clause's "still show a row done after
 * this reference was created" cutoff is a literal `Date.now()`, frozen
 * the instant it's written, because the data-view filter engine has no
 * "relative to now" comparison. Left alone, every duplicate of an
 * `affine:database-view-ref` block — a journal template copied into a new
 * daily journal, or a plain "Duplicate doc" — would carry the *original*
 * reference's cutoff forever, so the copy would keep showing every task
 * done since the ORIGINAL was created, including ones done long before
 * the COPY itself came into being.
 *
 * Story 2.11 (follow-up live bug): the exact same "frozen at
 * template-edit-time" shape also affects per-view column *visibility* —
 * specifically the hidden "Note color" plumbing column
 * (`DatabaseBlockDataSource.ensureNoteColorColumn`'s own comment has the
 * full detail). That column only ever comes into existence lazily, the
 * first time any row anywhere gets a note attached — templates
 * realistically never have a note attached to one of their own rows, so
 * "Note color" essentially never exists yet when a template's own view
 * was last edited, and every daily duplicate inherits that same
 * hide-less view forever, since duplication copies `views` verbatim
 * rather than recomputing it. Handled here rather than in
 * `ensureNoteColorColumn` itself (which is *also* fixed, separately, to
 * self-correct for the reference that actually triggers a note-attach)
 * because a reference that never itself attaches a note would otherwise
 * never get a chance to hide a column that started existing elsewhere.
 *
 * Registered into every `Transformer` used for duplication (see
 * `DocsService.duplicateFromTemplate`/`.duplicate()` in
 * `packages/frontend/core`), this runs once per freshly-created
 * `affine:database-view-ref` block **on the copy only** —
 * `slots.afterImport` fires per *target*-doc model, so the source
 * reference's own state (e.g. yesterday's journal page) is never
 * touched. Every rewrite here matches what a fresh manual `/Journal
 * Todo` insertion would have produced if run at that same moment, which
 * is exactly what a duplicated reference should behave like.
 *
 * Story 2.11 (live bug report, second follow-up — "auto-selected-today"
 * bug): resolving the canonical is a genuinely cross-doc lookup on
 * *every* daily duplication — the canonical "essentially never" lives
 * inside the day's own journal page (see
 * `insertJournalTodoReference`'s own comment in `configs/slash-menu.ts`).
 * A first pass here only ever checked `workspace.getDoc(targetDocId)` ->
 * `.getStore()` -> `.getBlock()` *synchronously*, and silently skipped
 * both fixes above whenever that returned nothing — which is the
 * deterministic (not rare) outcome for a canonical whose host doc hasn't
 * been explicitly loaded yet this session (`DocImpl.getStore()` has no
 * readiness guard; it just reads whatever is currently in the doc's
 * Y.Map, empty until `.load()` is called and content streams in — see
 * `packages/frontend/core/src/modules/workspace/impls/doc.ts`). That hit
 * most often on the very first Journal-Todo-related action of a session
 * (typically: auto-select today, then "Create journal" from template,
 * before anything else has warmed the canonical's doc into memory) —
 * exactly the "auto-selected-today" bug report. Fixed by retrying via
 * `waitForBlockInDoc` (the same helper `insertJournalTodoReference`
 * already uses for the identical resolution problem) instead of giving
 * up permanently on the first synchronous miss — see
 * `refreshJournalTodoOnDuplicateMiddleware`'s own body below.
 */
export const refreshJournalTodoOnDuplicateMiddleware =
  (options?: {
    /**
     * The workspace's current Journal Todo source. When given, a duplicated
     * Journal Todo reference that points at a different (older) table is
     * re-pointed at this one, so a journal created from a template uses the
     * table in use now, not the one the template was built against.
     */
    getCurrentSource?: () => JournalTodoSourceRef | undefined;
  }): TransformerMiddleware =>
  ({ slots }) => {
    let disposed = false;

    const attemptRefresh = (
      model: DatabaseViewRefBlockModel,
      mayWaitForDoc: boolean
    ) => {
      try {
        const targetDocId = model.props.refDocId || model.store.id;
        const workspace = model.store.workspace;
        const refDoc = workspace.getDoc(targetDocId);
        if (!refDoc) {
          // Story 2.11 (third follow-up) — GAP: this used to be a bare
          // `return`, i.e. a permanent, silent give-up, and it is one
          // readiness stage EARLIER than the `waitForBlockInDoc` retry
          // below. `Workspace.getDoc` resolves against a
          // `blockCollections` Map that `_bindDocMetaEvents()` fills
          // *reactively* from `meta.docMetaAdded` as the workspace root
          // doc's own metadata syncs — so on the first journal action of a
          // cold session the canonical's handle can legitimately not exist
          // yet for a doc that does exist and is about to appear. Bailing
          // there skipped BOTH fixes with no retry, which is why the
          // reported symptoms only ever showed up on the very first
          // (auto-selected-today) journal creation of a session and never
          // when a date was picked later, once the doc list had filled in.
          if (!mayWaitForDoc) return;
          waitForDocInWorkspace(workspace, targetDocId)
            .then(found => {
              if (!found || disposed) return;
              // Re-run the whole resolution now the handle exists; the
              // content-loading retry below still applies from there.
              attemptRefresh(model, false);
            })
            .catch(error => {
              console.error(
                '[database-view-ref] failed waiting for canonical doc to appear in workspace',
                error
              );
            });
          return;
        }
        const isSameDoc = refDoc === model.store.doc;
        const targetStore = isSameDoc
          ? model.store
          : refDoc.getStore({ id: refDoc.id });
        const canonicalModel = targetStore.getBlock(
          model.props.refBlockId
        )?.model;
        if (canonicalModel instanceof DatabaseBlockModel) {
          applyJournalTodoRefresh(model, canonicalModel);
          return;
        }

        // A same-doc reference's store is always the doc currently being
        // duplicated into — already guaranteed loaded, so a missing block
        // there means something else is wrong (e.g. a genuinely broken
        // ref), not a loading race. Only retry the genuinely cross-doc
        // case below.
        if (isSameDoc) return;

        // `workspace.getDoc()` returning a handle does NOT mean its
        // content has loaded yet: `refDoc.getStore()` (see `DocImpl` in
        // `packages/frontend/core/src/modules/workspace/impls/doc.ts`)
        // has no readiness guard and just reads whatever is currently in
        // the doc's Y.Map, which stays empty until `load()` is called and
        // nbstore streams its content in asynchronously. Per
        // `insertJournalTodoReference`'s own cross-doc branch in
        // `configs/slash-menu.ts` (identical resolution problem, already
        // solved there), the fix is to kick off loading and wait for the
        // block to actually appear rather than giving up permanently on
        // one synchronous check. This is the common case, not a rare
        // fluke: the canonical Journal Todo database "essentially never"
        // lives inside the day's own journal page (see that same file's
        // comment), so every daily duplication is a cross-doc resolution,
        // most likely to be hit cold on the first Journal-Todo-related
        // action of a session (e.g. auto-selecting today and creating
        // today's journal from template before anything else has warmed
        // this doc into memory).
        waitForBlockInDoc(refDoc, model.props.refBlockId)
          .then(found => {
            if (!found || disposed) return;
            const resolvedModel = targetStore.getBlock(
              model.props.refBlockId
            )?.model;
            if (resolvedModel instanceof DatabaseBlockModel) {
              applyJournalTodoRefresh(model, resolvedModel);
            }
          })
          .catch(error => {
            console.error(
              '[database-view-ref] failed to load canonical to refresh Journal Todo state on duplicate',
              error
            );
          });
      } catch (error) {
        console.error(
          '[database-view-ref] failed to refresh Journal Todo state on duplicate',
          error
        );
      }
    };

    const subscription = slots.afterImport
      .pipe(
        rxFilter((p): p is AfterImportBlockPayload => p.type === 'block'),
        map(({ model }) => model),
        rxFilter(
          (model): model is DatabaseViewRefBlockModel =>
            model instanceof DatabaseViewRefBlockModel
        )
      )
      .subscribe(model => {
        const current = options?.getCurrentSource?.();
        const refDocId = model.props.refDocId || model.store.id;
        const pointsElsewhere =
          !!current &&
          (current.refBlockId !== model.props.refBlockId ||
            current.refDocId !== refDocId);
        if (
          !current ||
          !pointsElsewhere ||
          !(model.props.views as ViewWithFilter[]).some(isJournalTodoView)
        ) {
          attemptRefresh(model, true);
          return;
        }
        const workspace = model.store.workspace;
        Promise.all([
          resolveDatabase(
            workspace,
            refDocId,
            model.props.refBlockId,
            model.store
          ),
          resolveDatabase(
            workspace,
            current.refDocId,
            current.refBlockId,
            model.store
          ),
        ])
          .then(([previousTable, currentTable]) => {
            if (disposed) return;
            if (!currentTable) {
              // The current source can't be found: keep the copy as it
              // was rather than pointing it at nothing.
              attemptRefresh(model, false);
              return;
            }
            repointJournalTodoReference(
              model,
              current,
              previousTable,
              currentTable
            );
            applyJournalTodoRefresh(model, currentTable);
          })
          .catch(error => {
            console.error(
              '[database-view-ref] failed to re-point a duplicated Journal Todo at the current source',
              error
            );
          });
      });
    return () => {
      disposed = true;
      subscription.unsubscribe();
    };
  };
