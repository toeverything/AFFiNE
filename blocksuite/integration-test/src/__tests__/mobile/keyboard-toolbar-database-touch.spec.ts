import { DatabaseBlockDataSource } from '@blocksuite/affine/blocks/database';
import type {
  DatabaseBlockModel,
  DatabaseViewRefBlockModel,
} from '@blocksuite/affine/model';
import {
  JournalTodoDatabaseProvider,
  NotificationProvider,
} from '@blocksuite/affine/shared/services';
import {
  defaultKeyboardToolbarConfig,
  type KeyboardToolPanelConfig,
  type KeyboardToolPanelGroup,
} from '@blocksuite/affine-widget-keyboard-toolbar';
import { viewPresets } from '@blocksuite/data-view/view-presets';
import { type BlockComponent, TextSelection } from '@blocksuite/std';
import { Text } from '@blocksuite/store';
import { beforeEach, describe, expect, test } from 'vitest';

import { wait } from '../utils/common.js';
import { addNote } from '../utils/edgeless.js';
import { setupEditor } from '../utils/setup.js';
import {
  registerStubVirtualKeyboardProviderForAllScopes,
  unregisterStubVirtualKeyboardProviderForAllScopes,
} from './utils.js';

// Story 2.12/Phase 2 (MOBILE-06, MOBILE-10): now that
// `utils/setup.ts`'s `createEditor` genuinely composes the mobile
// (`mobile-page`/`mobile-edgeless`) view-extension scope under
// `IS_MOBILE` (this plan's Task 1 fix), this file proves — for real, via a
// touch-emulated context — that the keyboard-toolbar's "+" Database tool
// group (`databaseToolGroup`, `keyboard-toolbar/src/config.ts`) is the true
// mobile reachability path for Calendar view (this file) and Journal Todo
// (added in Task 3), since the slash-menu widget itself never mounts on
// mobile (`SlashMenuViewExtension.setup`'s intentional mobile-scope early
// return — see `slash-menu-touch.spec.ts`'s corrected assertion).
function findDatabaseGroup(): KeyboardToolPanelGroup {
  const moreToolPanel = defaultKeyboardToolbarConfig.items.find(
    (item): item is KeyboardToolPanelConfig => 'groups' in item
  );
  expect(moreToolPanel).toBeTruthy();

  const databaseGroup = moreToolPanel?.groups.find(
    (group): group is KeyboardToolPanelGroup =>
      typeof group !== 'function' && group.name === 'Database'
  );
  expect(databaseGroup).toBeTruthy();

  return databaseGroup!;
}

describe('keyboard-toolbar database tool group touch reachability (Phase 2, MOBILE-06/MOBILE-10)', () => {
  beforeEach(async () => {
    // Phase 4 (MOBILE-12): "Journal Todo"/"Calendar" tool-group actions
    // insert an `affine:database-view-ref` reference block, whose nested
    // preview now also builds the keyboard-toolbar widget's 'preview-page'
    // scope registration (`view.ts`'s Task 1 fix) — that nested
    // `BlockStdScope` needs its own `VirtualKeyboardProvider`, invisible to
    // the plain `createStubVirtualKeyboardExtension()` + `setupEditor`
    // extensions-array pattern this file used previously (see
    // `mobile/utils.ts`'s own doc comment on
    // `registerStubVirtualKeyboardProviderForAllScopes`).
    registerStubVirtualKeyboardProviderForAllScopes();
    const cleanup = await setupEditor('page');
    return async () => {
      await cleanup();
      unregisterStubVirtualKeyboardProviderForAllScopes();
    };
  });

  async function selectFreshParagraph() {
    const noteId = addNote(doc);
    const paragraphId = doc.addBlock('affine:paragraph', {}, noteId);
    const model = doc.getModelById(paragraphId)!;

    const selection = editor.std.selection.create(TextSelection, {
      from: { blockId: paragraphId, index: 0, length: 0 },
      to: null,
    });
    editor.std.selection.setGroup('note', [selection]);
    await wait();

    return { paragraphId, model };
  }

  // Tracer: proves the harness fix (Task 1) genuinely composes mobile scope
  // AND that the keyboard-toolbar registration mechanism this whole phase
  // relies on for MOBILE-06/09 actually works end-to-end.
  test('the keyboard-toolbar\'s "Calendar view" item inserts a calendar-view database block', async () => {
    await selectFreshParagraph();

    const databaseGroup = findDatabaseGroup();
    const calendarItem = databaseGroup.items.find(
      item => item.name === 'Calendar view'
    );
    expect(calendarItem).toBeTruthy();

    const databaseBlocksBefore = doc.getBlocksByFlavour('affine:database');
    expect(databaseBlocksBefore.length).toBe(0);

    await calendarItem!.action?.({
      std: editor.std,
      rootComponent: {} as BlockComponent,
      closeToolPanel: () => {},
    });
    await wait();

    const databaseBlocksAfter = doc.getBlocksByFlavour('affine:database');
    expect(databaseBlocksAfter.length).toBe(1);
    const databaseModel = databaseBlocksAfter[0]!.model as DatabaseBlockModel;
    const seededView = databaseModel.props.views[0] as unknown as {
      mode: string;
    };
    expect(seededView.mode).toBe(viewPresets.calendarViewMeta.type);
  });

  // Task 3 (MOBILE-06): proves the keyboard-toolbar's "Journal Todo" item
  // invokes the shared `insertJournalTodoReference` function — extracted in
  // this same task from the slash-menu's own "Journal Todo" action — with
  // identical, correctly-seeded results (fresh canonical, `list`-mode view,
  // 2-condition OR-grace filter), matching `slash-menu-touch.spec.ts`'s own
  // desktop-path assertions for the same underlying logic. Mirrors that
  // file's `createStubStdForJournalTodo` — a `getOptional` Proxy override is
  // the right tool for `JournalTodoDatabaseProvider` specifically (a pure
  // read/write pointer seam), not a real DI registration.
  function createStubStdForJournalTodo(
    journalDate: string,
    isTemplateDoc = false,
    options: {
      initialRef?: { refDocId: string; refBlockId: string };
      confirm?: () => Promise<boolean>;
    } = {}
  ) {
    let ref: { refDocId: string; refBlockId: string } | undefined =
      options.initialRef;
    const confirms: string[] = [];
    const stub = new Proxy(editor.std, {
      get(target, prop, receiver) {
        if (prop === 'getOptional') {
          return (identifier: unknown) => {
            if (identifier === JournalTodoDatabaseProvider) {
              return {
                getJournalDate: () => journalDate,
                getJournalTodoDatabaseRef: () => ref,
                setJournalTodoDatabaseRef: (newRef: typeof ref) => {
                  ref = newRef;
                },
                isTemplateDoc: () => isTemplateDoc,
              };
            }
            if (identifier === NotificationProvider && options.confirm) {
              return {
                toast: () => {},
                confirm: (opts: { message: string }) => {
                  confirms.push(String(opts.message));
                  return options.confirm!();
                },
              };
            }
            return undefined;
          };
        }
        if (prop === 'host') {
          const realHost = Reflect.get(target, prop, receiver) as object;
          return new Proxy(realHost, {
            get(hostTarget, hostProp) {
              if (hostProp === 'std') return stub;
              return Reflect.get(hostTarget, hostProp, hostTarget);
            },
          });
        }
        return Reflect.get(target, prop, receiver);
      },
    });
    return { stub, getRef: () => ref, confirms };
  }

  test('the keyboard-toolbar\'s "Journal Todo" item inserts a correctly-seeded database-view-ref block via insertJournalTodoReference', async () => {
    await selectFreshParagraph();
    const { stub, getRef } = createStubStdForJournalTodo('2026-08-08');

    const databaseGroup = findDatabaseGroup();
    const journalTodoItem = databaseGroup.items.find(
      item => item.name === 'Journal Todo'
    );
    expect(journalTodoItem).toBeTruthy();

    await journalTodoItem!.action?.({
      std: stub,
      rootComponent: {} as BlockComponent,
      closeToolPanel: () => {},
    });
    await wait();

    const ref = getRef();
    expect(ref).toBeTruthy();
    const canonicalModel = doc.getBlock(ref!.refBlockId)
      ?.model as DatabaseBlockModel;
    expect(canonicalModel?.flavour).toBe('affine:database');

    const refEl = document.querySelector(
      'affine-database-view-ref'
    ) as HTMLElement & { model: DatabaseViewRefBlockModel };
    expect(refEl).toBeTruthy();
    const refModel = refEl.model;
    expect(refModel.props.refBlockId).toBe(ref!.refBlockId);
    const seededView = refModel.props.views[0] as unknown as {
      mode: string;
      filter: { op: string; conditions: unknown[] };
    };
    expect(seededView.mode).toBe('list');
    expect(seededView.filter.op).toBe('or');
    expect(seededView.filter.conditions.length).toBe(2);
  });

  // 999.20: "New Journal Todo Table" (desktop slash menu, Story 2.5.5/2.11)
  // was unreachable on mobile, where the slash menu never mounts.
  test('the keyboard-toolbar\'s "New Journal Todo Table" item creates a visible table at the cursor and makes it the Journal Todo source', async () => {
    const { model } = await selectFreshParagraph();
    const { stub, getRef } = createStubStdForJournalTodo('2026-10-28');

    const newTableItem = findDatabaseGroup().items.find(
      item => item.name === 'New Journal Todo Table'
    );
    expect(newTableItem).toBeTruthy();
    expect(
      newTableItem!.showWhen?.({
        std: stub,
        rootComponent: {} as BlockComponent,
        closeToolPanel: () => {},
      }) ?? true
    ).toBe(true);

    await newTableItem!.action?.({
      std: stub,
      rootComponent: {} as BlockComponent,
      closeToolPanel: () => {},
    });
    await wait();

    const databases = doc.getBlocksByFlavour('affine:database');
    expect(databases.length).toBe(1);
    const table = databases[0]!.model as DatabaseBlockModel;
    expect(table.props.title.toString()).toBe('Journal Todo');
    // Visible, right after the cursor's block -- not hidden in a note.
    expect(doc.getNext(model)?.id).toBe(table.id);
    expect(getRef()).toEqual({ refDocId: doc.id, refBlockId: table.id });
  });

  test('"New Journal Todo Table" is not offered inside a template doc', async () => {
    await selectFreshParagraph();
    const { stub } = createStubStdForJournalTodo('2026-10-28', true);

    const newTableItem = findDatabaseGroup().items.find(
      item => item.name === 'New Journal Todo Table'
    );
    expect(newTableItem).toBeTruthy();
    expect(
      newTableItem!.showWhen?.({
        std: stub,
        rootComponent: {} as BlockComponent,
        closeToolPanel: () => {},
      })
    ).toBe(false);
  });

  // 999.19: replacing an existing source table asks whether to copy its
  // undone tasks into the new one (copy, not move: the old table is left
  // untouched as a record).
  async function createPreviousSourceTable(
    tasks: { text: string; done: boolean }[]
  ) {
    const noteId = addNote(doc);
    const tableId = doc.addBlock(
      'affine:database',
      { title: new Text('Old Journal Todo') },
      noteId
    );
    const table = doc.getModelById(tableId) as DatabaseBlockModel;
    const dataSource = new DatabaseBlockDataSource(table);
    dataSource.ensureTaskStatusColumn();
    for (const task of tasks) {
      const rowId = doc.addBlock(
        'affine:paragraph',
        { text: new Text(task.text) },
        tableId
      );
      dataSource.setTaskStatusChecked(rowId, task.done);
    }
    await wait();
    return table;
  }

  async function runNewJournalTodoTable(confirm: () => Promise<boolean>) {
    const previous = await createPreviousSourceTable([
      { text: 'undone one', done: false },
      { text: 'already done', done: true },
      { text: 'undone two', done: false },
    ]);
    await selectFreshParagraph();
    const { stub, getRef, confirms } = createStubStdForJournalTodo(
      '2026-10-28',
      false,
      {
        initialRef: { refDocId: doc.id, refBlockId: previous.id },
        confirm,
      }
    );
    const newTableItem = findDatabaseGroup().items.find(
      item => item.name === 'New Journal Todo Table'
    );
    await newTableItem!.action?.({
      std: stub,
      rootComponent: {} as BlockComponent,
      closeToolPanel: () => {},
    });
    await wait(50);

    const created = doc
      .getBlocksByFlavour('affine:database')
      .map(block => block.model as DatabaseBlockModel)
      .find(table => table.id !== previous.id)!;
    expect(getRef()).toEqual({ refDocId: doc.id, refBlockId: created.id });
    return { previous, created, confirms };
  }

  test('"New Journal Todo Table" offers to copy the previous table\'s undone tasks, and copies only those when accepted', async () => {
    const { previous, created, confirms } = await runNewJournalTodoTable(
      async () => true
    );

    expect(confirms.length).toBe(1);
    expect(confirms[0]).toContain('2');
    const createdSource = new DatabaseBlockDataSource(created);
    expect(created.children.map(row => row.text?.toString())).toEqual([
      'undone one',
      'undone two',
    ]);
    for (const row of created.children) {
      expect(createdSource.getTaskStatusInfo(row.id)?.checked).toBe(false);
    }
    // The previous table is left exactly as it was.
    expect(previous.children.map(row => row.text?.toString())).toEqual([
      'undone one',
      'already done',
      'undone two',
    ]);
  });

  test('declining the copy leaves the new Journal Todo table empty', async () => {
    const { previous, created, confirms } = await runNewJournalTodoTable(
      async () => false
    );

    expect(confirms.length).toBe(1);
    expect(created.children.length).toBe(0);
    expect(previous.children.length).toBe(3);
  });
});
