import { DebugLogger } from '@affine/debug';
import { Unreachable } from '@affine/env/constant';
import { refreshJournalTodoOnDuplicateMiddleware } from '@blocksuite/affine/blocks/database-view-ref';
import type {
  DatabaseRefBlockModel,
  DatabaseViewRefBlockModel,
  NoteBlockModel,
  NoteRefBlockModel,
} from '@blocksuite/affine/model';
import { NoteDisplayMode } from '@blocksuite/affine/model';
import { replaceIdMiddleware } from '@blocksuite/affine/shared/adapters';
import type { AffineTextAttributes } from '@blocksuite/affine/shared/types';
import {
  ensureDocLoaded,
  waitForDocSettled,
} from '@blocksuite/affine/shared/utils';
import type { DeltaInsert } from '@blocksuite/affine/store';
import { Slice, Text, Transformer } from '@blocksuite/affine/store';
import { ObjectPool, Service } from '@toeverything/infra';
import { combineLatest, map } from 'rxjs';

import { initDocFromProps } from '../../../blocksuite/initialization';
import { readJournalTodoDatabaseRef } from '../../journal/store/journal-todo-database';
import { getAFFiNEWorkspaceSchema } from '../../workspace/global-schema';
import type { Doc } from '../entities/doc';
import { DocRecordList } from '../entities/record-list';
import { DocCreated, DocInitialized } from '../events';
import type { DocCreateMiddleware } from '../providers/doc-create-middleware';
import { DocScope } from '../scopes/doc';
import type { DocPropertiesStore } from '../stores/doc-properties';
import type { DocsStore } from '../stores/docs';
import type { DocCreateOptions } from '../types';
import { DocService } from './doc';
import { getDuplicatedDocTitle } from './duplicate-title';

const logger = new DebugLogger('DocsService');

export class DocsService extends Service {
  list = this.framework.createEntity(DocRecordList);

  pool = new ObjectPool<string, Doc>({
    onDelete(obj) {
      obj.scope.dispose();
    },
  });

  /**
   * Get all property values of a property, used for search
   *
   * Results may include docs in trash or deleted docs
   * Legacy property data such as old `journal` will not be included in the values
   */
  propertyValues$(propertyKey: string) {
    return combineLatest([
      this.store.watchDocIds(),
      this.docPropertiesStore.watchPropertyAllValues(propertyKey),
    ]).pipe(
      map(([docIds, propertyValues]) => {
        const result = new Map<string, string | undefined>();
        for (const docId of docIds) {
          result.set(docId, propertyValues.get(docId));
        }
        return result;
      })
    );
  }

  /**
   * used for search
   */
  allDocsCreatedDate$() {
    return this.store.watchAllDocCreateDate();
  }

  /**
   * used for search
   */
  allDocsUpdatedDate$() {
    return this.store.watchAllDocUpdatedDate();
  }

  allDocsTagIds$() {
    return this.store.watchAllDocTagIds();
  }

  allDocIds$() {
    return this.store.watchDocIds();
  }

  allNonTrashDocIds$() {
    return this.store.watchNonTrashDocIds();
  }

  allTrashDocIds$() {
    return this.store.watchTrashDocIds();
  }

  allDocTitle$() {
    return this.store.watchAllDocTitle();
  }

  constructor(
    private readonly store: DocsStore,
    private readonly docPropertiesStore: DocPropertiesStore,
    private readonly docCreateMiddlewares: DocCreateMiddleware[]
  ) {
    super();
  }

  loaded(docId: string) {
    const exists = this.pool.get(docId);
    if (exists) {
      return { doc: exists.obj, release: exists.release };
    }
    return null;
  }

  open(docId: string) {
    const docRecord = this.list.doc$(docId).value;
    if (!docRecord) {
      throw new Error('Doc record not found');
    }
    const blockSuiteDoc = this.store.getBlockSuiteDoc(docId);
    if (!blockSuiteDoc) {
      throw new Error('Doc not found');
    }

    const exists = this.pool.get(docId);
    if (exists) {
      return { doc: exists.obj, release: exists.release };
    }

    const docScope = this.framework.createScope(DocScope, {
      docId,
      blockSuiteDoc,
      record: docRecord,
    });

    try {
      blockSuiteDoc.load();
    } catch (e) {
      logger.error('Failed to load doc', {
        docId,
        error: e,
      });
    }

    const doc = docScope.get(DocService).doc;

    doc.scope.emitEvent(DocInitialized, doc);

    const { obj, release } = this.pool.put(docId, doc);

    return { doc: obj, release };
  }

  createDoc(options: DocCreateOptions = {}) {
    for (const middleware of this.docCreateMiddlewares) {
      options = middleware.beforeCreate
        ? middleware.beforeCreate(options)
        : options;
    }
    const id = this.store.createDoc(options.id);
    const docStore = this.store.getBlockSuiteDoc(id);
    if (!docStore) {
      throw new Error('Failed to create doc');
    }
    if (options.skipInit !== true) {
      initDocFromProps(docStore, options.docProps, options);
    }
    const docRecord = this.list.doc$(id).value;
    if (!docRecord) {
      throw new Unreachable();
    }
    if (options.primaryMode) {
      docRecord.setPrimaryMode(options.primaryMode);
    }
    if (options.isTemplate) {
      docRecord.setProperty('isTemplate', true);
    }
    for (const middleware of this.docCreateMiddlewares) {
      middleware.afterCreate?.(docRecord, options);
    }
    docRecord.setCreatedAt(Date.now());
    docRecord.setUpdatedAt(Date.now());
    this.eventBus.emit(DocCreated, {
      doc: docRecord,
      docCreateOptions: options,
    });
    return docRecord;
  }

  getCustomPropertyById(docId: string, propertyId: string) {
    return this.docPropertiesStore.getDocProperties(docId)?.[
      'custom:' + propertyId
    ] as string | undefined;
  }

  setCustomPropertyById(docId: string, propertyId: string, value: string) {
    return this.docPropertiesStore.updateDocProperties(docId, {
      ['custom:' + propertyId]: value,
    });
  }

  async addLinkedDoc(targetDocId: string, linkedDocId: string) {
    const { doc, release } = this.open(targetDocId);
    const disposePriorityLoad = doc.addPriorityLoad(10);
    await doc.waitForSyncReady();
    disposePriorityLoad();
    const text = new Text([
      {
        insert: ' ',
        attributes: {
          reference: {
            type: 'LinkedPage',
            pageId: linkedDocId,
          },
        },
      },
    ] as DeltaInsert<AffineTextAttributes>[]);
    const [frame] = doc.blockSuiteDoc.getBlocksByFlavour('affine:note');
    frame &&
      doc.blockSuiteDoc.addBlock(
        'affine:paragraph' as never, // TODO(eyhn): fix type
        { text },
        frame.id
      );
    release();
  }

  async changeDocTitle(docId: string, newTitle: string) {
    const { doc, release } = this.open(docId);
    const disposePriorityLoad = doc.addPriorityLoad(10);
    await doc.waitForSyncReady();
    disposePriorityLoad();
    doc.changeDocTitle(newTitle);
    release();
  }

  async duplicate(sourceDocId: string, _targetDocId?: string) {
    const targetDocId = _targetDocId ?? this.createDoc().id;

    // check if source doc is removed
    if (this.list.doc$(sourceDocId).value?.trash$.value) {
      console.warn(
        `Template doc(id: ${sourceDocId}) is removed, skip duplicate`
      );
      return targetDocId;
    }

    const { release: sourceRelease, doc: sourceDoc } = this.open(sourceDocId);
    const { release: targetRelease, doc: targetDoc } = this.open(targetDocId);
    await sourceDoc.waitForSyncReady();

    // duplicate doc content
    try {
      const sourceBsDoc = this.store.getBlockSuiteDoc(sourceDocId);
      const targetBsDoc = this.store.getBlockSuiteDoc(targetDocId);
      if (!sourceBsDoc) throw new Error('Source doc not found');
      if (!targetBsDoc) throw new Error('Target doc not found');

      // clear the target doc (both surface and note)
      targetBsDoc.root?.children.forEach(child =>
        targetBsDoc.deleteBlock(child)
      );

      const collection = this.store.getBlocksuiteCollection();
      const transformer = new Transformer({
        schema: getAFFiNEWorkspaceSchema(),
        blobCRUD: collection.blobSync,
        docCRUD: {
          create: (id: string) => {
            this.createDoc({ id });
            const store = collection.getDoc(id)?.getStore({ id });
            if (!store) {
              throw new Error('Failed to create doc');
            }
            return store;
          },
          get: (id: string) => collection.getDoc(id)?.getStore({ id }) ?? null,
          delete: (id: string) => collection.removeDoc(id),
        },
        middlewares: [
          replaceIdMiddleware(collection.idGenerator),
          // Story 2.11: refreshes the Journal Todo grace clause's frozen
          // `Date.now()` filter literal on every duplicated
          // `affine:database-view-ref` block — see that middleware's own
          // comment for the full "why". Registered here (not just inside
          // `duplicateFromTemplate` below) so plain "Duplicate doc" gets
          // the same fix, not only journal-template duplication.
          refreshJournalTodoOnDuplicateMiddleware({
            getCurrentSource: () => {
              const ref = readJournalTodoDatabaseRef(
                this.store.getWorkspaceRootYDoc()
              );
              return ref
                ? { refDocId: ref.docId, refBlockId: ref.databaseId }
                : undefined;
            },
          }),
        ],
      });
      const slice = Slice.fromModels(sourceBsDoc, [
        ...(sourceBsDoc.root?.children ?? []),
      ]);
      const snapshot = transformer.sliceToSnapshot(slice);
      if (!snapshot) {
        throw new Error('Failed to create snapshot');
      }
      await transformer.snapshotToSlice(
        snapshot,
        targetBsDoc,
        targetBsDoc.root?.id
      );
    } catch (e) {
      logger.error('Failed to duplicate doc', {
        sourceDocId,
        targetDocId,
        originalTargetDocId: _targetDocId,
        error: e,
      });
    } finally {
      sourceRelease();
      targetRelease();
    }

    // duplicate doc meta
    targetDoc.record.setMeta({
      tags: sourceDoc.meta$.value.tags,
    });

    // duplicate doc title
    targetDoc.changeDocTitle(getDuplicatedDocTitle(sourceDoc.title$.value));

    // duplicate doc properties
    const properties = sourceDoc.getProperties();
    const removedProperties = ['id', 'isTemplate', 'journal'];
    removedProperties.forEach(key => {
      delete properties[key];
    });
    targetDoc.updateProperties(properties);

    return targetDocId;
  }

  /**
   * Before a doc is *permanently* deleted, rescue any `affine:database` it
   * hosts that's still referenced by a live `affine:database-ref` block in
   * some *other*, surviving doc — whether or not it was ever
   * same-page-promoted into a hidden `EdgelessOnly` note (see
   * `ensurePromoted`/`moveIntoHiddenNote` in
   * `@blocksuite/affine-block-database-ref`; a database referenced ONLY
   * cross-doc never goes through that and stays a perfectly ordinary,
   * visible block the whole time).
   *
   * Ordinary trash (`moveToTrash`) never touches block content at all, so
   * this only matters for the permanent-delete path (`removeDoc`) — that
   * path has no reference-awareness whatsoever otherwise, and would
   * silently destroy data another page still visibly displays.
   *
   * Frame is deliberately NOT covered here: a Frame's content *is* the
   * edgeless surface of its own doc, so there's no independent "Frame data"
   * to relocate the way a database's self-contained block/row data can be —
   * a cross-doc Frame reference into a permanently-deleted doc is expected
   * to break, not a bug to work around.
   */
  async rescueReferencedDatabasesBeforeDelete(docId: string): Promise<void> {
    const collection = this.store.getBlocksuiteCollection();

    // Permanent delete is normally triggered from the Trash list view, not
    // from having the doc open — meaning the doc being deleted itself very
    // likely isn't loaded either. Without this, scanning it below for
    // promoted databases would silently find nothing (empty store) and
    // return before ever attempting a rescue.
    const sourceDoc = collection.getDoc(docId);
    if (!sourceDoc) return;
    await waitForDocSettled(sourceDoc);

    const sourceBsDoc = this.store.getBlockSuiteDoc(docId);
    if (!sourceBsDoc) return;

    // Every `affine:database` in this doc is a rescue candidate — NOT just
    // ones already sitting in a hidden `EdgelessOnly` note. That hidden-note
    // shape only exists for a database that was ALSO same-page-promoted
    // (Story 0.2's "second local reference" flow, via `ensurePromoted`).
    // Cross-doc referencing alone deliberately never promotes the source
    // (`insertDatabaseRefBlockCommand`'s cross-doc branch skips
    // `ensurePromoted` entirely — the target already has a legitimate home
    // in its own doc) — so a database referenced ONLY cross-doc, never
    // locally, stays a perfectly ordinary, visible database the whole
    // time. What actually matters for rescue purposes is just "does any
    // `database-ref` anywhere point at this id," not its own parent shape.
    const allDatabases = sourceBsDoc
      .getBlocksByFlavour('affine:database')
      .map(b => b.model);

    if (allDatabases.length === 0) return;

    // Every other doc's content needs to have actually arrived before
    // scanning it below — `otherDoc.load()` only *starts* loading, it
    // doesn't wait for the doc's Yjs content to stream in from local
    // storage, so a doc that hasn't been opened this session would
    // otherwise scan as empty (no references found) even though it
    // genuinely has one, silently skipping the rescue entirely.
    await Promise.all(
      Array.from(collection.docs.values())
        .filter(otherDoc => otherDoc.id !== docId)
        .map(otherDoc => waitForDocSettled(otherDoc))
    );

    for (const databaseModel of allDatabases) {
      const parent = sourceBsDoc.getParent(databaseModel);
      const isHiddenNoteParent =
        parent?.flavour === 'affine:note' &&
        (parent as NoteBlockModel).props.displayMode ===
          NoteDisplayMode.EdgelessOnly;

      // Find a surviving reference to this canonical elsewhere in the
      // workspace — if none exists, this data has no live reader and it's
      // fine to let it be destroyed along with the rest of the doc.
      let destinationDocId: string | null = null;
      for (const [otherDocId, otherDoc] of collection.docs) {
        if (otherDocId === docId) continue;
        const otherStore = otherDoc.getStore({ id: otherDocId });
        const hasRef =
          otherStore
            .getBlocksByFlavour('affine:database-ref')
            .some(
              b =>
                (b.model as DatabaseRefBlockModel).props.refBlockId ===
                databaseModel.id
            ) ||
          otherStore
            .getBlocksByFlavour('affine:database-view-ref')
            .some(
              b =>
                (b.model as DatabaseViewRefBlockModel).props.refBlockId ===
                databaseModel.id
            );
        if (hasRef) {
          destinationDocId = otherDocId;
          break;
        }
      }
      if (!destinationDocId) continue;

      const destinationBsDoc = collection
        .getDoc(destinationDocId)
        ?.getStore({ id: destinationDocId });
      if (!destinationBsDoc) continue;

      try {
        const transformer = new Transformer({
          schema: getAFFiNEWorkspaceSchema(),
          blobCRUD: collection.blobSync,
          docCRUD: {
            create: (id: string) => {
              this.createDoc({ id });
              const store = collection.getDoc(id)?.getStore({ id });
              if (!store) {
                throw new Error('Failed to create doc');
              }
              return store;
            },
            get: (id: string) =>
              collection.getDoc(id)?.getStore({ id }) ?? null,
            delete: (id: string) => collection.removeDoc(id),
          },
          // Deliberately no `replaceIdMiddleware` — the whole point is that
          // `refBlockId` on every existing `database-ref` keeps resolving
          // after the move, so ids must be preserved, not regenerated.
          middlewares: [],
        });

        // If it was already sitting in a dedicated hidden note (the
        // same-page-promoted case), move that whole note — it exists
        // solely to host this database, nothing else is lost. Otherwise
        // (a database that was only ever cross-doc referenced, never
        // promoted) it's a bare, ordinary database block with no note of
        // its own dedicated to it — move just the block, into a freshly
        // created hidden note in the destination, mirroring what
        // `ensurePromoted` itself would have done.
        const modelsToMove =
          isHiddenNoteParent && parent ? [parent] : [databaseModel];
        const slice = Slice.fromModels(sourceBsDoc, modelsToMove);
        const snapshot = transformer.sliceToSnapshot(slice);
        if (!snapshot) {
          throw new Error('Failed to snapshot canonical database for rescue');
        }

        let insertionParentId = destinationBsDoc.root?.id;
        if (!isHiddenNoteParent) {
          if (!destinationBsDoc.root) {
            throw new Error('Destination doc has no root block');
          }
          insertionParentId = destinationBsDoc.addBlock(
            'affine:note',
            {
              displayMode: NoteDisplayMode.EdgelessOnly,
              xywh: '[-10000, -10000, 800, 480]',
            },
            destinationBsDoc.root.id
          );
        }

        await transformer.snapshotToSlice(
          snapshot,
          destinationBsDoc,
          insertionParentId
        );

        // Repoint every database-ref across the workspace (including the
        // one in `destinationDocId` itself, which is now a same-doc
        // reference) that pointed at this canonical in the doc being
        // deleted, to its new home.
        for (const [otherDocId, otherDoc] of collection.docs) {
          ensureDocLoaded(otherDoc);
          const otherStore = otherDoc.getStore({ id: otherDocId });
          for (const ref of otherStore.getBlocksByFlavour(
            'affine:database-ref'
          )) {
            const refModel = ref.model as DatabaseRefBlockModel;
            if (
              refModel.props.refBlockId === databaseModel.id &&
              refModel.props.refDocId === docId
            ) {
              otherStore.updateBlock(refModel, {
                refDocId: destinationDocId,
              });
            }
          }
          for (const ref of otherStore.getBlocksByFlavour(
            'affine:database-view-ref'
          )) {
            const refModel = ref.model as DatabaseViewRefBlockModel;
            if (
              refModel.props.refBlockId === databaseModel.id &&
              refModel.props.refDocId === docId
            ) {
              otherStore.updateBlock(refModel, {
                refDocId: destinationDocId,
              });
            }
          }
        }
      } catch (e) {
        logger.error(
          'Failed to rescue promoted database before permanent delete',
          { docId, databaseId: databaseModel.id, error: e }
        );
      }
    }
  }

  /**
   * Before a doc is *permanently* deleted, rescue any `affine:note` it
   * hosts that's still referenced by a live `affine:note-ref` block in some
   * *other*, surviving doc (Story 0.6).
   *
   * Unlike `rescueReferencedDatabasesBeforeDelete`, there is no
   * hidden-note-vs-bare-block branch to consider: `affine:note`'s own
   * schema already permits `parent: ['@root']`, so the canonical Note is
   * always independently valid the moment it's moved — it never needed a
   * dedicated host note to begin with (see `note-ref-model.ts`'s own
   * doc comment). The whole canonical Note block is simply relocated
   * directly into the destination doc's root.
   *
   * The referenced doc's own primary/page note (`isPageBlock()`) is
   * excluded — the slash-menu picker never offers it as a reference target
   * in the first place (see `noteRefSlashMenuConfig`), so it should never
   * have a live `note-ref` pointing at it in practice, but the guard is kept
   * here too since relocating a doc's actual page content on delete would
   * be a much larger behavior change than rescuing a purpose-made reusable
   * note.
   */
  async rescueReferencedNotesBeforeDelete(docId: string): Promise<void> {
    const collection = this.store.getBlocksuiteCollection();

    const sourceDoc = collection.getDoc(docId);
    if (!sourceDoc) return;
    await waitForDocSettled(sourceDoc);

    const sourceBsDoc = this.store.getBlockSuiteDoc(docId);
    if (!sourceBsDoc) return;

    const allNotes = sourceBsDoc
      .getBlocksByFlavour('affine:note')
      .map(b => b.model as NoteBlockModel)
      .filter(note => !note.isPageBlock());

    if (allNotes.length === 0) return;

    await Promise.all(
      Array.from(collection.docs.values())
        .filter(otherDoc => otherDoc.id !== docId)
        .map(otherDoc => waitForDocSettled(otherDoc))
    );

    for (const noteModel of allNotes) {
      let destinationDocId: string | null = null;
      for (const [otherDocId, otherDoc] of collection.docs) {
        if (otherDocId === docId) continue;
        const otherStore = otherDoc.getStore({ id: otherDocId });
        const hasRef = otherStore
          .getBlocksByFlavour('affine:note-ref')
          .some(
            b =>
              (b.model as NoteRefBlockModel).props.refBlockId === noteModel.id
          );
        if (hasRef) {
          destinationDocId = otherDocId;
          break;
        }
      }
      if (!destinationDocId) continue;

      await this.relocateNoteToAnotherDoc(
        docId,
        noteModel.id,
        destinationDocId
      );
    }
  }

  /**
   * Moves a single `affine:note` block from `sourceDocId` into
   * `destinationDocId`'s root, repointing every existing `affine:note-ref`
   * (in any doc) that points at it to the new location. Shared by
   * `rescueReferencedNotesBeforeDelete` (automatic, on permanent delete —
   * Story 0.6) and the user-triggered "Move to another page" toolbar action
   * (Story 0.5) — both are the exact same underlying operation, one
   * automatic and one explicit, so this extracts the single implementation
   * rather than duplicating the `Transformer`/`Slice` setup a second time.
   *
   * Deliberately no `replaceIdMiddleware` in the `Transformer` config: every
   * existing `note-ref`'s `refBlockId` must keep resolving after the move,
   * so the note's own id (and its children's ids) must survive unchanged.
   */
  async relocateNoteToAnotherDoc(
    sourceDocId: string,
    noteId: string,
    destinationDocId: string
  ): Promise<boolean> {
    const collection = this.store.getBlocksuiteCollection();

    const sourceBsDoc = this.store.getBlockSuiteDoc(sourceDocId);
    if (!sourceBsDoc) return false;

    const noteModel = sourceBsDoc.getBlock(noteId)?.model as
      | NoteBlockModel
      | undefined;
    if (!noteModel) return false;

    const destinationBsDoc = collection
      .getDoc(destinationDocId)
      ?.getStore({ id: destinationDocId });
    if (!destinationBsDoc) return false;

    try {
      const transformer = new Transformer({
        schema: getAFFiNEWorkspaceSchema(),
        blobCRUD: collection.blobSync,
        docCRUD: {
          create: (id: string) => {
            this.createDoc({ id });
            const store = collection.getDoc(id)?.getStore({ id });
            if (!store) {
              throw new Error('Failed to create doc');
            }
            return store;
          },
          get: (id: string) => collection.getDoc(id)?.getStore({ id }) ?? null,
          delete: (id: string) => collection.removeDoc(id),
        },
        middlewares: [],
      });

      const slice = Slice.fromModels(sourceBsDoc, [noteModel]);
      const snapshot = transformer.sliceToSnapshot(slice);
      if (!snapshot) {
        throw new Error('Failed to snapshot note for relocation');
      }

      await transformer.snapshotToSlice(
        snapshot,
        destinationBsDoc,
        destinationBsDoc.root?.id
      );

      for (const [otherDocId, otherDoc] of collection.docs) {
        ensureDocLoaded(otherDoc);
        const otherStore = otherDoc.getStore({ id: otherDocId });
        for (const ref of otherStore.getBlocksByFlavour('affine:note-ref')) {
          const refModel = ref.model as NoteRefBlockModel;
          if (
            refModel.props.refBlockId === noteId &&
            refModel.props.refDocId === sourceDocId
          ) {
            otherStore.updateBlock(refModel, {
              refDocId: destinationDocId,
            });
          }
        }
      }

      sourceBsDoc.deleteBlock(noteModel);

      return true;
    } catch (e) {
      logger.error('Failed to relocate note to another doc', {
        sourceDocId,
        noteId,
        destinationDocId,
        error: e,
      });
      return false;
    }
  }

  /**
   * Moves a single `affine:database` block from `sourceDocId` into
   * `destinationDocId`, repointing every existing `affine:database-ref` and
   * `affine:database-view-ref` (in any doc) that points at it to the new
   * location — the user-triggered "Move to another page" action (Story
   * 2.3), mirroring `relocateNoteToAnotherDoc` (Story 0.5) with one
   * necessary addition: a database can be pointed at by *two* independent
   * reference flavours, not one, exactly the same dual-flavour concern
   * `rescueReferencedDatabasesBeforeDelete` (Story 2.2) already solved for
   * the delete-time-rescue case — this reuses that same `isHiddenNoteParent`
   * detection and dual-flavour repoint loop rather than reinventing them.
   *
   * Deliberately no `replaceIdMiddleware`: every existing reference's
   * `refBlockId` must keep resolving after the move, so the database's own
   * id (and its rows'/children's ids) must survive unchanged.
   *
   * Diverges from `rescueReferencedDatabasesBeforeDelete` in one place: when
   * the database wasn't already living in a dedicated hidden note, that
   * method always wraps it in a *new hidden* note on arrival (correct for
   * an automatic rescue — nothing needs to see it, only resolve it). This
   * is a user-triggered, visible move instead, so a bare database is wrapped
   * in a new *normal, visible* note at the destination — `affine:database`'s
   * own schema requires `parent: ['affine:note']` (it can never sit
   * directly at doc root, unlike Note itself), so a parent note is still
   * required, just not a hidden one.
   */
  async relocateDatabaseToAnotherDoc(
    sourceDocId: string,
    databaseId: string,
    destinationDocId: string
  ): Promise<boolean> {
    // Moving into the same doc isn't a move at all — the app-layer bridge
    // (`patchDatabaseMoveService`) already rejects this before calling in,
    // but the service method itself must not trust that guard is the only
    // caller; without this check, a same-doc call would re-insert the same
    // id into the doc it's already in, then delete the original out from
    // under it.
    if (sourceDocId === destinationDocId) return false;

    const collection = this.store.getBlocksuiteCollection();

    const sourceBsDoc = this.store.getBlockSuiteDoc(sourceDocId);
    if (!sourceBsDoc) return false;

    const databaseModel = sourceBsDoc.getBlock(databaseId)?.model;
    if (!databaseModel) return false;

    const destinationBsDoc = collection
      .getDoc(destinationDocId)
      ?.getStore({ id: destinationDocId });
    if (!destinationBsDoc) return false;

    // Guards against re-running a move onto a destination that already
    // resolved this same id (e.g. a prior partial/failed move) — inserting
    // a second block under the same id with no `replaceIdMiddleware` would
    // produce an ambiguous same-doc collision with no detection downstream.
    if (destinationBsDoc.getBlock(databaseId)) return false;

    const parent = sourceBsDoc.getParent(databaseModel);
    const isHiddenNoteParent =
      parent?.flavour === 'affine:note' &&
      (parent as NoteBlockModel).props.displayMode ===
        NoteDisplayMode.EdgelessOnly;

    try {
      const transformer = new Transformer({
        schema: getAFFiNEWorkspaceSchema(),
        blobCRUD: collection.blobSync,
        docCRUD: {
          create: (id: string) => {
            this.createDoc({ id });
            const store = collection.getDoc(id)?.getStore({ id });
            if (!store) {
              throw new Error('Failed to create doc');
            }
            return store;
          },
          get: (id: string) => collection.getDoc(id)?.getStore({ id }) ?? null,
          delete: (id: string) => collection.removeDoc(id),
        },
        // Deliberately no `replaceIdMiddleware` — every existing
        // `database-ref`/`database-view-ref`'s `refBlockId` must keep
        // resolving after the move, so ids must be preserved, not
        // regenerated.
        middlewares: [],
      });

      const modelsToMove =
        isHiddenNoteParent && parent ? [parent] : [databaseModel];
      const slice = Slice.fromModels(sourceBsDoc, modelsToMove);
      const snapshot = transformer.sliceToSnapshot(slice);
      if (!snapshot) {
        throw new Error('Failed to snapshot database for relocation');
      }

      let insertionParentId = destinationBsDoc.root?.id;
      if (!isHiddenNoteParent) {
        // A bare database was never promoted into a hidden host note — it
        // needs a *visible* one here (not the delete-rescue path's hidden
        // one), since this is a user-facing move, not a backup slot.
        //
        // Explicit `pageBorder: false`: this note exists purely to host the
        // moved database, not to read as "a distinct note among other
        // notes" the way a real secondary note (e.g. from `/note`) should
        // — `NoteBlockComponent`'s `_showBorder` falls back to
        // `!isPageBlock()` whenever `pageBorder` is left `undefined`, which
        // is `true` for any non-primary note, so an unset value here would
        // leave a visible border around the moved table. Mirrors the exact
        // same "explicit `pageBorder: false` at creation time" pattern
        // already used for a doc's own primary note
        // (`EditorSettingDocCreateMiddleware.beforeCreate`) — see
        // `note-model.ts`'s own comment on why the explicit value beats the
        // `isPageBlock()` fallback.
        if (!destinationBsDoc.root) {
          throw new Error('Destination doc has no root block');
        }
        insertionParentId = destinationBsDoc.addBlock(
          'affine:note',
          { pageBorder: false },
          destinationBsDoc.root.id
        );
      }

      await transformer.snapshotToSlice(
        snapshot,
        destinationBsDoc,
        insertionParentId
      );

      // Repoint every database-ref/database-view-ref across the workspace
      // (including one in `destinationDocId` itself, which is now a
      // same-doc reference) that pointed at this canonical in the source
      // doc, to its new home.
      for (const [otherDocId, otherDoc] of collection.docs) {
        ensureDocLoaded(otherDoc);
        const otherStore = otherDoc.getStore({ id: otherDocId });
        for (const ref of otherStore.getBlocksByFlavour(
          'affine:database-ref'
        )) {
          const refModel = ref.model as DatabaseRefBlockModel;
          if (
            refModel.props.refBlockId === databaseId &&
            refModel.props.refDocId === sourceDocId
          ) {
            otherStore.updateBlock(refModel, {
              refDocId: destinationDocId,
            });
          }
        }
        for (const ref of otherStore.getBlocksByFlavour(
          'affine:database-view-ref'
        )) {
          const refModel = ref.model as DatabaseViewRefBlockModel;
          if (
            refModel.props.refBlockId === databaseId &&
            refModel.props.refDocId === sourceDocId
          ) {
            otherStore.updateBlock(refModel, {
              refDocId: destinationDocId,
            });
          }
        }
      }

      // Unlike the delete-rescue path (which only runs when the source doc
      // is about to be destroyed anyway), this is a live, in-place move —
      // the original must be removed so it doesn't end up duplicated.
      if (isHiddenNoteParent && parent) {
        sourceBsDoc.deleteBlock(parent);
      } else {
        sourceBsDoc.deleteBlock(databaseModel);
      }

      return true;
    } catch (e) {
      logger.error('Failed to relocate database to another doc', {
        sourceDocId,
        databaseId,
        destinationDocId,
        error: e,
      });
      return false;
    }
  }

  /**
   * Duplicate a doc from template
   * @param sourceDocId - the id of the source doc to be duplicated
   * @param _targetDocId - the id of the target doc to be duplicated, if not provided, a new doc will be created
   * @returns the id of the new doc
   */
  async duplicateFromTemplate(sourceDocId: string, _targetDocId?: string) {
    const targetDocId = _targetDocId ?? this.createDoc().id;

    // check if source doc is removed
    if (this.list.doc$(sourceDocId).value?.trash$.value) {
      console.warn(
        `Template doc(id: ${sourceDocId}) is removed, skip duplicate`
      );
      return targetDocId;
    }

    const { release: sourceRelease, doc: sourceDoc } = this.open(sourceDocId);
    const { release: targetRelease, doc: targetDoc } = this.open(targetDocId);
    await sourceDoc.waitForSyncReady();

    // duplicate doc content
    try {
      const sourceBsDoc = this.store.getBlockSuiteDoc(sourceDocId);
      const targetBsDoc = this.store.getBlockSuiteDoc(targetDocId);
      if (!sourceBsDoc) throw new Error('Source doc not found');
      if (!targetBsDoc) throw new Error('Target doc not found');

      // clear the target doc (both surface and note)
      targetBsDoc.root?.children.forEach(child =>
        targetBsDoc.deleteBlock(child)
      );

      const collection = this.store.getBlocksuiteCollection();
      const transformer = new Transformer({
        schema: getAFFiNEWorkspaceSchema(),
        blobCRUD: collection.blobSync,
        docCRUD: {
          create: (id: string) => {
            this.createDoc({ id });
            const store = collection.getDoc(id)?.getStore({ id });
            if (!store) {
              throw new Error('Failed to create doc');
            }
            return store;
          },
          get: (id: string) => collection.getDoc(id)?.getStore({ id }) ?? null,
          delete: (id: string) => collection.removeDoc(id),
        },
        middlewares: [
          replaceIdMiddleware(collection.idGenerator),
          // Story 2.11: refreshes the Journal Todo grace clause's frozen
          // `Date.now()` filter literal on every duplicated
          // `affine:database-view-ref` block — see that middleware's own
          // comment for the full "why". Also registered in `duplicate`
          // above, so plain "Duplicate doc" gets the same fix, not just
          // journal-template duplication.
          refreshJournalTodoOnDuplicateMiddleware({
            getCurrentSource: () => {
              const ref = readJournalTodoDatabaseRef(
                this.store.getWorkspaceRootYDoc()
              );
              return ref
                ? { refDocId: ref.docId, refBlockId: ref.databaseId }
                : undefined;
            },
          }),
        ],
      });
      const slice = Slice.fromModels(sourceBsDoc, [
        ...(sourceBsDoc.root?.children ?? []),
      ]);
      const snapshot = transformer.sliceToSnapshot(slice);
      if (!snapshot) {
        throw new Error('Failed to create snapshot');
      }
      await transformer.snapshotToSlice(
        snapshot,
        targetBsDoc,
        targetBsDoc.root?.id
      );
    } catch (e) {
      logger.error('Failed to duplicate doc', {
        sourceDocId,
        targetDocId,
        originalTargetDocId: _targetDocId,
        error: e,
      });
    } finally {
      sourceRelease();
      targetRelease();
    }

    // duplicate doc properties
    const properties = sourceDoc.getProperties();
    const removedProperties = ['id', 'isTemplate', 'journal'];
    removedProperties.forEach(key => {
      delete properties[key];
    });
    targetDoc.updateProperties(properties);

    return targetDocId;
  }
}
