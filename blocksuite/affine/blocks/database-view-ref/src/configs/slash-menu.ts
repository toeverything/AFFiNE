import { DatabaseBlockDataSource } from '@blocksuite/affine-block-database';
import { toast } from '@blocksuite/affine-components/toast';
import type { DatabaseBlockModel } from '@blocksuite/affine-model';
import { DatabaseBlockSchema, NoteDisplayMode } from '@blocksuite/affine-model';
import {
  CrossDocReferenceProvider,
  JournalTodoDatabaseProvider,
} from '@blocksuite/affine-shared/services';
import {
  ensureDocLoaded,
  waitForBlockInDoc,
} from '@blocksuite/affine-shared/utils';
import {
  type SlashMenuActionItem,
  type SlashMenuConfig,
  SlashMenuConfigExtension,
  type SlashMenuItem,
} from '@blocksuite/affine-widget-slash-menu';
import type { FilterGroup } from '@blocksuite/data-view';
import {
  DatabaseListViewIcon,
  DatabaseTableViewIcon,
  LinkIcon,
} from '@blocksuite/icons/lit';
import { BlockSelection, type BlockStdScope } from '@blocksuite/std';
import { type BlockModel, Text } from '@blocksuite/store';

import { insertDatabaseViewRefBlockCommand } from '../commands.js';
import { offerToCopyUndoneTasks } from '../journal-todo-carryover.js';

/**
 * Story 2.11 (post-review): every `isTemplateDoc` call in this file gates
 * whether a canonical/pointer mutation is allowed to proceed — it must
 * never be allowed to crash the *whole* slash menu (every other command
 * registered alongside these, not just this file's own) if a provider
 * implementation misbehaves or throws. Fails open (`false`, i.e. "not a
 * template") rather than closed: this guard is a narrow safety net against
 * accidentally forking the canonical, not a security boundary, so an
 * indeterminate answer should not block ordinary usage.
 */
function safeIsTemplateDoc(
  journalTodo: { isTemplateDoc: (docId: string) => boolean },
  docId: string
): boolean {
  try {
    return journalTodo.isTemplateDoc(docId);
  } catch (error) {
    console.error('[journal-todo] isTemplateDoc check failed', error);
    return false;
  }
}

/**
 * Story 2.4: a creation preset over `insertDatabaseViewRefBlockCommand`
 * (Story 2.2) — auto-resolves (or creates, on first-ever use) "the current
 * journal todo database" (a single workspace-wide pointer, see
 * `JournalTodoDatabaseProvider`) and inserts a reference to it seeded with
 * a `'list'`-mode view filtered to hide done tasks. Story 2.11: offered
 * from any doc (journal, normal page, or a template doc), not gated on
 * `getJournalDate` resolving — journal-date-vs-wall-clock behavior for the
 * inserted view is handled live, per-render, by
 * `DatabaseBlockDataSource.getDueDateHighlightState`, not by this command's
 * own visibility. The one remaining doc-type-sensitive behavior lives
 * inside the action below: first-use canonical creation refuses to run
 * inside a template doc (see the `isTemplateDoc` check). General-purpose
 * "reference an arbitrary database" is Story 2.5's job, not this one.
 */
export const journalTodoDatabaseSlashMenuConfig: SlashMenuConfig = {
  items: ({ std, model }) => {
    const journalTodo = std.getOptional(JournalTodoDatabaseProvider);
    if (!journalTodo) return [];

    return [
      {
        name: 'Journal Todo',
        description: 'Insert your journal task list',
        searchAlias: ['todo', 'journal', 'tasks'],
        icon: DatabaseListViewIcon(),
        group: '7_Database@4',
        action: () => {
          insertJournalTodoReference(std, model).catch(console.error);
        },
      },
    ];
  },
};

export const JournalTodoDatabaseSlashMenuConfigExtension =
  SlashMenuConfigExtension(
    'affine:database-view-ref-journal-todo',
    journalTodoDatabaseSlashMenuConfig
  );

/**
 * Story 2.4/Phase 2 (extracted, MOBILE-06): the shared insertion logic
 * behind `journalTodoDatabaseSlashMenuConfig`'s "Journal Todo" slash-menu
 * item — pulled out to module scope so the keyboard-toolbar's own "Journal
 * Todo" item (mobile's real reachability path, since the slash-menu widget
 * never mounts on mobile) can invoke byte-identical insertion logic instead
 * of duplicating it. Auto-resolves (or creates, on first-ever use) "the
 * current journal todo database" (a single workspace-wide pointer, see
 * `JournalTodoDatabaseProvider`) and inserts a reference to it seeded with
 * a `'list'`-mode view filtered to hide done tasks.
 */
export async function insertJournalTodoReference(
  std: BlockStdScope,
  model: BlockModel
): Promise<void> {
  const journalTodo = std.getOptional(JournalTodoDatabaseProvider);
  if (!journalTodo) {
    // Desktop's slash-menu item (`journalTodoDatabaseSlashMenuConfig.items`)
    // gates the whole "Journal Todo" entry on this provider being
    // available, so it's simply absent from the menu when missing. The
    // mobile keyboard-toolbar's "Journal Todo" item only gates on the
    // `affine:database` schema being registered (it can't cheaply re-check
    // provider availability from `showWhen` the way the desktop slash-menu
    // does), so this function is reachable with no provider present — give
    // the same feedback `insertCrossDocReference` gives for its own
    // missing-provider case, instead of a silent no-op.
    toast(std.host, 'Journal Todo is not available.');
    return;
  }

  const store = std.store;

  let ref = journalTodo.getJournalTodoDatabaseRef();
  let justCreatedCanonical:
    | { hiddenNoteId: string; databaseId: string }
    | undefined;
  if (!ref && safeIsTemplateDoc(journalTodo, store.id)) {
    // Story 2.11: refuse rather than silently create — a canonical
    // created inside a template doc would get deep-copied fresh
    // into every future daily journal (template duplication has no
    // ID-remapping awareness of this block's ref props at all, see
    // `replace-id.ts`), permanently forking the "single source of
    // truth" database once per day. Point the user at explicit
    // setup instead (`journalTodoSourceSlashMenuConfig`, run from a
    // non-template doc).
    toast(
      std.host,
      'This doc is a template, so a new Journal Todo table can’t be created here. Set up your Journal Todo table from a regular page first, then it can be referenced here.'
    );
    return;
  }
  if (!ref) {
    // First-ever use: create a fresh canonical database, pre-
    // promoted into its own hidden note (mirrors
    // `database-ref/src/commands.ts`'s `moveIntoHiddenNote` shape,
    // constructed directly here since there's nothing to promote
    // yet — this *is* the first reference).
    store.captureSync();
    const hiddenNoteId = store.addBlock(
      'affine:note',
      {
        displayMode: NoteDisplayMode.EdgelessOnly,
        xywh: '[-10000, -10000, 800, 480]',
      },
      store.root!.id
    );
    const databaseId = store.addBlock(
      'affine:database',
      { title: new Text('Journal Todo') },
      hiddenNoteId
    );
    const databaseModel = store.getBlock(databaseId)
      ?.model as DatabaseBlockModel;
    new DatabaseBlockDataSource(databaseModel).ensureTaskStatusColumn();

    ref = { refDocId: store.id, refBlockId: databaseId };
    justCreatedCanonical = { hiddenNoteId, databaseId };
    journalTodo.setJournalTodoDatabaseRef(ref);
  }

  // Resolve the Status column/"done" option off whichever
  // canonical we're pointing at (freshly created or previously
  // established) to build the "not done" filter — reuses the same
  // accessors `ensureTaskStatusColumn`/task-status resolution
  // already use elsewhere, rather than a second Status-finding
  // mechanism.
  //
  // Cross-doc reuse (every day after the first, since the canonical
  // lives wherever it was first created, essentially never today's
  // doc): the target doc may not be loaded locally yet, so this
  // must wait for it the same way `insertDatabaseViewRefBlockCommand`'s
  // own cross-doc branch does — resolving `canonicalModel`
  // synchronously here would silently skip filter construction
  // whenever the doc hadn't finished loading, seeding a view with
  // no filter at all (showing every task, done or not).
  const isCrossDoc = ref.refDocId !== store.id;
  let canonicalStore = isCrossDoc ? undefined : store;
  if (isCrossDoc) {
    const refDoc = std.workspace.getDoc(ref.refDocId);
    if (refDoc) {
      ensureDocLoaded(refDoc);
      const found = await waitForBlockInDoc(refDoc, ref.refBlockId);
      canonicalStore = found ? refDoc.getStore({ id: refDoc.id }) : undefined;
    }
  }
  const canonicalModel = canonicalStore?.getBlock(ref.refBlockId)?.model as
    | DatabaseBlockModel
    | undefined;

  if (!canonicalModel && safeIsTemplateDoc(journalTodo, store.id)) {
    // Story 2.11 (post-review): a *stale* ref (pointing at a
    // deleted/never-resolving canonical) bypasses the `!ref`-only
    // guard above, since `ref` itself is still set. Falling through
    // to `insertDatabaseViewRefBlockCommand` below with a ref that's
    // already known (via the resolution just above) not to resolve
    // would leave a broken, unseeded `database-view-ref` sitting in
    // this template doc — that command's cross-doc branch inserts
    // optimistically and only discovers a missing target
    // asynchronously afterward, without rolling back (a deliberate,
    // established pattern mirrored from `database-ref`'s identical
    // command; not something to change there, since it's shared by
    // several other stories and every other caller relies on it).
    // A broken block left inside a template gets deep-copied into
    // every future daily journal, so refuse here instead, same as
    // the no-ref case above.
    toast(
      std.host,
      'Your Journal Todo source no longer exists. Set up your Journal Todo table from a regular page first, then it can be referenced here.'
    );
    return;
  }

  let initialFilter: FilterGroup | undefined;
  if (canonicalModel) {
    const dataSource = new DatabaseBlockDataSource(canonicalModel);
    const statusColumnId = dataSource.ensureTaskStatusColumn();
    // Story 2.6: guarantees the "Note" column exists on this
    // canonical every time `/Journal Todo` resolves against it —
    // not just on rows created after this fix — mirroring the
    // exact same eager-ensure pattern used for Status/Done date
    // right here. Without this, `ensureNoteColumn()` (only
    // otherwise called lazily from inside the cell's own
    // create/reveal/attach actions) never runs for a canonical
    // whose existing rows were all created before this story
    // shipped, so the column — and therefore the whole feature —
    // silently never appears.
    dataSource.ensureNoteColumn();
    // Story 2.7: guarantees the "Due date" column exists on this
    // canonical every time `/Journal Todo` resolves against it —
    // same eager-ensure reasoning as Note above. Without this, a
    // Calendar view added later via the database's own normal
    // view-switcher (no Journal-Todo-specific insert command,
    // per direct user correction) would have no Due date column
    // to fall back to yet, and would ask the user to set one up
    // even though this database has always been task-workflow-
    // capable.
    dataSource.ensureDueDateColumn(std);
    const doneOption = dataSource.getTaskStatusTargetOption(
      'done',
      statusColumnId
    );
    if (statusColumnId && doneOption) {
      const doneDateColumnId = dataSource.ensureDoneDateColumn();
      // A task done *after this specific reference was created*
      // stays visible in *this* reference — it's only excluded
      // once a *later* reference (a fresh `database-view-ref`,
      // created later in real wall-clock time) comes along. This
      // is a literal `Date.now()` baked into the stored filter at
      // insertion time, deliberately NOT based on the journal's
      // own date — a journal can be dated in the future or the
      // past, but "was this marked done since I opened this
      // particular list" is always a real-time question. Live
      // re-evaluation of a plain "not done" filter would otherwise
      // hide a row the instant it's marked done, even from the
      // very reference it was just checked off in.
      //
      // Story 2.11 (live bug, twice-revisited — read this before
      // changing this clause again): the data-view filter engine
      // has no "relative to now" comparison, only literals, so
      // this literal is fundamentally frozen from the moment it's
      // written. Two things were tried and reverted here: (1)
      // omitting the clause when `isTemplateDoc` was true at
      // insertion time — missed the case where a doc becomes a
      // template *after* insertion, and made template-sourced and
      // manually-inserted references behave differently, which
      // the user rejected; (2) moving the "stays visible after
      // check-off" behavior entirely into ephemeral, in-memory,
      // non-persisted state on `DatabaseBlockDataSource` — this
      // fixed the template/manual inconsistency, but broke a more
      // important, pre-existing guarantee: going back to an old
      // journal day must still show *that day's own* completed
      // tasks, which requires this to be persisted (ephemeral
      // state doesn't survive navigating away and back — a fresh
      // `DatabaseBlockDataSource` is constructed per render, with
      // an empty grace set).
      //
      // Resolved fix: keep this clause as a real, persisted
      // literal (below) — unconditionally, the same for every
      // insertion — and instead fix the actual root cause of the
      // "frozen forever" problem at its source: block duplication.
      // A dedicated `TransformerMiddleware`
      // (`refreshJournalTodoOnDuplicateMiddleware`, this
      // package's own `duplicate-middleware.ts`) runs on every
      // `affine:database-view-ref` copy produced by template
      // duplication *or* plain "Duplicate doc" (wired into both
      // `DocsService.duplicateFromTemplate` and `.duplicate()`)
      // and rewrites this exact clause's literal to the
      // duplication moment on the COPY only — the original
      // reference (e.g. yesterday's journal page) keeps its own
      // original literal untouched, so its own history stays
      // intact. See that middleware's own comment for the full
      // mechanism.
      const referenceCreatedAtMs = Date.now();
      initialFilter = {
        type: 'group',
        op: 'or',
        conditions: [
          {
            type: 'filter',
            left: { type: 'ref', name: statusColumnId },
            function: 'isNotOneOf',
            args: [{ type: 'literal', value: [doneOption.id] }],
          },
          ...(doneDateColumnId
            ? [
                {
                  type: 'filter' as const,
                  left: {
                    type: 'ref' as const,
                    name: doneDateColumnId,
                  },
                  function: 'after',
                  args: [
                    {
                      type: 'literal' as const,
                      value: referenceCreatedAtMs - 1,
                    },
                  ],
                },
              ]
            : []),
        ],
      };
    }
  }

  const [_, result] = std.command.exec(insertDatabaseViewRefBlockCommand, {
    refBlockId: ref.refBlockId,
    refDocId: ref.refDocId,
    place: 'after',
    removeEmptyLine: true,
    selectedModels: [model],
    initialView: { viewType: 'list', initialFilter },
  });
  if (!result.insertedDatabaseViewRefBlockId) {
    // If this invocation just created the canonical (first-ever
    // use) and insertion still failed, roll it back rather than
    // leaving an orphaned database + a permanent workspace pointer
    // with no visible reference anywhere — every future invocation
    // would otherwise silently reuse this empty, ref-less canonical.
    if (justCreatedCanonical) {
      store.deleteBlock(justCreatedCanonical.databaseId);
      store.deleteBlock(justCreatedCanonical.hiddenNoteId);
      journalTodo.setJournalTodoDatabaseRef(undefined);
    }
    toast(std.host, 'Could not insert the journal todo list.');
    return;
  }
  std.selection.set([
    std.selection.create(BlockSelection, {
      blockId: result.insertedDatabaseViewRefBlockId,
    }),
  ]);
}

/**
 * Story 2.5: the generic, non-journal-specific counterpart to
 * `journalTodoDatabaseSlashMenuConfig` above — lets a user reference *any*
 * database (same-doc or cross-doc) and get a `database-view-ref` with its
 * own independent, unfiltered `'table'` view (no auto-resolution, no
 * auto-filter). Purely additive alongside `database-ref/src/configs/
 * slash-menu.ts`'s existing "Table: <name>"/"Reference" items, which keep
 * producing plain `database-ref` (shared views) exactly as before — this
 * is a second, distinctly-labeled choice for when an independent view is
 * wanted, not a replacement.
 */
export const genericDatabaseViewRefSlashMenuConfig: SlashMenuConfig = {
  items: ({ std, model }) => {
    // Starts well past `journalTodoDatabaseSlashMenuConfig`'s own hardcoded
    // `'7_Database@4'` slot (same file, same `'Database'` group) to avoid a
    // sort-key collision — both configs are registered together in
    // `view.ts`, and a same-doc-item count large enough would otherwise land
    // on the exact same key as the "Journal Todo" item, producing an
    // unintended, arbitrary relative order between two unrelated entries.
    let index = 100;

    // `model` is the slash command's own anchor block (e.g. a paragraph) —
    // never a database itself, so there is no "self" to exclude here;
    // every same-doc database block is a valid candidate.
    const databaseBlocks = std.store.getBlocksByFlavour(
      DatabaseBlockSchema.model.flavour
    );

    const sameDocItems = databaseBlocks.map<SlashMenuActionItem>(block => {
      const databaseModel = block.model as DatabaseBlockModel;
      const title = databaseModel.props.title.toString();
      return {
        name: 'Table (own view): ' + (title || '(untitled)'),
        description: 'Reference this table with an independent view/filter',
        icon: DatabaseTableViewIcon(),
        group: `7_Database@${index++}`,
        action: () => {
          const [_, result] = std.command.exec(
            insertDatabaseViewRefBlockCommand,
            {
              refBlockId: block.id,
              place: 'after',
              removeEmptyLine: true,
              selectedModels: [model],
            }
          );
          if (!result.insertedDatabaseViewRefBlockId) return;
          std.selection.set([
            std.selection.create(BlockSelection, {
              blockId: result.insertedDatabaseViewRefBlockId,
            }),
          ]);
        },
      };
    });

    // Same picker `database-ref`'s own "Reference" item uses, restricted to
    // `affine:database` candidates only — frames/notes have no
    // `database-view-ref` counterpart to insert.
    const crossDocItem: SlashMenuItem = {
      name: 'Reference (own view)',
      description:
        'Reference a table from a different doc with an independent view/filter',
      icon: LinkIcon(),
      group: `7_Database@${index++}`,
      action: () => {
        (async () => {
          const crossDocReference = std.getOptional(CrossDocReferenceProvider);
          if (!crossDocReference) {
            toast(std.host, 'Cross-doc referencing is not available.');
            return;
          }

          const candidate = await crossDocReference.openCrossDocReferencePicker(
            std.store.id,
            ['affine:database']
          );
          // A `null` candidate means the user cancelled the picker — not a
          // failure, so no toast here.
          if (!candidate) return;
          // Defensive: don't trust that passing `['affine:database']` as
          // `allowedFlavours` guarantees the picker only ever returns that
          // flavour — a misconfigured/future provider implementation could
          // still return something else, which must not be silently
          // inserted as if it were a database.
          if (candidate.flavour !== 'affine:database') {
            toast(std.host, 'Could not insert that reference.');
            return;
          }

          const [_, result] = std.command.exec(
            insertDatabaseViewRefBlockCommand,
            {
              refBlockId: candidate.blockId,
              refDocId: candidate.docId,
              place: 'after',
              removeEmptyLine: true,
              selectedModels: [model],
            }
          );
          if (!result.insertedDatabaseViewRefBlockId) {
            toast(std.host, 'Could not insert that reference.');
            return;
          }

          std.selection.set([
            std.selection.create(BlockSelection, {
              blockId: result.insertedDatabaseViewRefBlockId,
            }),
          ]);
        })().catch(console.error);
      },
    };

    return [...sameDocItems, crossDocItem];
  },
};

export const GenericDatabaseViewRefSlashMenuConfigExtension =
  SlashMenuConfigExtension(
    'affine:database-view-ref-generic',
    genericDatabaseViewRefSlashMenuConfig
  );

/**
 * "New Journal Todo Table": create a visible Journal Todo table right after
 * `model` and point the workspace-wide Journal Todo source at it. Shared by
 * the desktop slash menu and the mobile keyboard toolbar (999.20), where
 * the slash menu never mounts.
 */
export async function createJournalTodoSourceTable(
  std: BlockStdScope,
  model: BlockModel
): Promise<void> {
  const journalTodo = std.getOptional(JournalTodoDatabaseProvider);
  if (!journalTodo) return;
  const store = std.store;
  // Story 2.11 (post-review): re-check at click time, not just when
  // the menu was built — the list-level filter below only decides
  // whether this item is *offered*; without this, a doc's template
  // status flipping between menu-open and click (or a resolved-items
  // array reused/cached by some caller not in view here) would let
  // this slip through unguarded. Mirrors
  // `journalTodoDatabaseSlashMenuConfig`'s own action-time re-check.
  if (safeIsTemplateDoc(journalTodo, store.id)) {
    toast(
      std.host,
      'This doc is a template, so a new Journal Todo table can’t be created here.'
    );
    return;
  }
  const priorSource = journalTodo.getJournalTodoDatabaseRef();
  const hadPriorSource = !!priorSource;

  store.captureSync();
  // Unlike `journalTodoDatabaseSlashMenuConfig`'s own silent
  // first-use auto-create (hidden in a pre-promoted note), this is a
  // deliberate, visible user action — the new table is inserted
  // directly at the cursor (as a sibling of the slash command's own
  // anchor block), not hidden.
  let databaseId: string | undefined;
  try {
    [databaseId] = store.addSiblingBlocks(
      model,
      [
        {
          flavour: 'affine:database',
          title: new Text('Journal Todo'),
        },
      ],
      'after'
    );
  } catch (error) {
    console.error('[journal-todo-source] failed to create table', error);
  }
  if (!databaseId) {
    toast(std.host, 'Could not create a new table here.');
    return;
  }
  const databaseModel = store.getBlock(databaseId)?.model as DatabaseBlockModel;
  new DatabaseBlockDataSource(databaseModel).ensureTaskStatusColumn();

  journalTodo.setJournalTodoDatabaseRef({
    refDocId: store.id,
    refBlockId: databaseId,
  });
  toast(
    std.host,
    hadPriorSource
      ? 'Replaced your previous Journal Todo source with a new "Journal Todo" table.'
      : '"Journal Todo" is now your Journal Todo source.'
  );
  std.selection.set([
    std.selection.create(BlockSelection, { blockId: databaseId }),
  ]);

  // 999.19: offer to bring the previous table's undone tasks along.
  if (priorSource) {
    await offerToCopyUndoneTasks(std, priorSource, databaseModel);
  }
}

/**
 * Whether "New Journal Todo Table" may be offered in the current doc: never
 * inside a template doc (Story 2.11), where it would fork a new canonical
 * into every future daily journal.
 */
export function canCreateJournalTodoSourceTable(std: BlockStdScope): boolean {
  const journalTodo = std.getOptional(JournalTodoDatabaseProvider);
  return !!journalTodo && !safeIsTemplateDoc(journalTodo, std.store.id);
}

/**
 * Story 2.5.5: lets the user explicitly set (or create) "the current
 * journal todo database" pointer (`JournalTodoDatabaseProvider`) themselves,
 * instead of only ever getting whatever `journalTodoDatabaseSlashMenuConfig`
 * silently auto-created on its own first-ever invocation. These items only
 * ever mutate the pointer — they never construct a filter or insert a
 * `database-view-ref` themselves; that remains exclusively
 * `journalTodoDatabaseSlashMenuConfig`'s own job (run `/Journal Todo`
 * afterward to get a filtered reference against whichever table was just
 * chosen here). Not gated on `getJournalDate` — deciding "this table is my
 * journal source" is just as valid from a normal page as from inside a
 * journal itself. The "next journal uses it" requirement needs no code
 * here at all: `journalTodoDatabaseSlashMenuConfig` already reads the
 * pointer fresh on every invocation, so whatever these items just set *is*
 * what every future `/Journal Todo` invocation resolves to.
 *
 * Originally shipped as one item per same-doc table plus a separate
 * cross-doc item — per direct user feedback that per-table enumeration is
 * unnecessary clutter for what's a niche action, this collapses down to a
 * single "Set Journal Todo Table" item that opens one picker covering both
 * same-doc and cross-doc candidates at once (`excludeDocId: null` — see
 * `CrossDocReferenceService.openCrossDocReferencePicker`'s own doc comment).
 */
export const journalTodoSourceSlashMenuConfig: SlashMenuConfig = {
  items: ({ std, model }) => {
    const journalTodo = std.getOptional(JournalTodoDatabaseProvider);
    if (!journalTodo) return [];

    // Mirrors `genericDatabaseViewRefSlashMenuConfig`'s own group-index
    // offset scheme, in a distinct range so all three configs sharing this
    // file/group never collide on sort key.
    let index = 200;

    const setExistingItem: SlashMenuItem = {
      name: 'Set Journal Todo Table',
      description: 'Choose which table is your Journal Todo source',
      icon: LinkIcon(),
      group: `7_Database@${index++}`,
      action: () => {
        (async () => {
          const crossDocReference = std.getOptional(CrossDocReferenceProvider);
          if (!crossDocReference) {
            toast(std.host, 'Cross-doc referencing is not available.');
            return;
          }

          // `null` excludes nothing, so the current doc's own tables are
          // browsable/searchable in the same picker as every other doc's —
          // one entry point instead of a separate same-doc-only mechanism.
          const candidate = await crossDocReference.openCrossDocReferencePicker(
            null,
            ['affine:database']
          );
          // A `null` candidate means the user cancelled the picker — not a
          // failure, so no toast here.
          if (!candidate) return;
          if (candidate.flavour !== 'affine:database') {
            toast(std.host, 'Could not set that as your Journal Todo source.');
            return;
          }
          // Story 2.11 (post-review): guards the *invoking* doc against being
          // a template, but a picked candidate can itself live inside a
          // template doc regardless of where this command was run from (e.g.
          // a database manually added to a template via `/Table`) — refuse
          // that pick too, for the same reason: the canonical would then live
          // inside a template, and every future daily journal duplication
          // would carry a dead copy of it while the real pointer stayed
          // pinned to the template forever.
          if (safeIsTemplateDoc(journalTodo, candidate.docId)) {
            toast(
              std.host,
              'That table lives inside a template doc and can’t be used as your Journal Todo source. Move it to a regular page first.'
            );
            return;
          }

          journalTodo.setJournalTodoDatabaseRef({
            refDocId: candidate.docId,
            refBlockId: candidate.blockId,
          });

          // Resolve the picked table's own title for the confirmation toast
          // — the picker already confirmed it exists, so no wait/retry
          // needed here, just a direct read (mirrors
          // `journalTodoDatabaseSlashMenuConfig`'s own cross-doc resolution
          // shape, minus the load-wait since we just picked this candidate
          // from an already-loaded picker result).
          const isCrossDoc = candidate.docId !== std.store.id;
          const candidateStore = isCrossDoc
            ? std.workspace.getDoc(candidate.docId)?.getStore({
                id: candidate.docId,
              })
            : std.store;
          const candidateTitle =
            (
              candidateStore?.getBlock(candidate.blockId)?.model as
                | DatabaseBlockModel
                | undefined
            )?.props.title.toString() || '(untitled)';
          toast(
            std.host,
            `"${candidateTitle}" is now your Journal Todo source.`
          );
        })().catch(console.error);
      },
    };

    const newSourceItem: SlashMenuActionItem = {
      name: 'New Journal Todo Table',
      description: 'Create a table and set it as your Journal Todo source',
      icon: DatabaseTableViewIcon(),
      group: `7_Database@${index++}`,
      action: () => {
        createJournalTodoSourceTable(std, model).catch(console.error);
      },
    };

    // Story 2.11: "New Journal Todo Table" always creates a table wherever
    // it's invoked and unconditionally repoints the workspace-wide pointer
    // — never valid to do inside a template doc (would fork a new
    // "canonical" into every future daily journal). Unlike
    // `journalTodoDatabaseSlashMenuConfig`'s "Journal Todo" item (which
    // stays visible and toast-refuses on click, since it's a habitual
    // daily command), there's no legitimate reason to ever offer this one
    // here, so it's simply omitted. "Set Journal Todo Table" never
    // creates anything, so it stays available unconditionally.
    if (safeIsTemplateDoc(journalTodo, std.store.id)) {
      return [setExistingItem];
    }

    return [setExistingItem, newSourceItem];
  },
};

export const JournalTodoSourceSlashMenuConfigExtension =
  SlashMenuConfigExtension(
    'affine:database-view-ref-journal-todo-source',
    journalTodoSourceSlashMenuConfig
  );
