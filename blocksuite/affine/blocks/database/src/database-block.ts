import { CaptionedBlockComponent } from '@blocksuite/affine-components/caption';
import {
  menu,
  popMenu,
  popupTargetFromElement,
} from '@blocksuite/affine-components/context-menu';
import { DropIndicator } from '@blocksuite/affine-components/drop-indicator';
import { PeekViewProvider } from '@blocksuite/affine-components/peek';
import { toast } from '@blocksuite/affine-components/toast';
import type { DatabaseBlockModel } from '@blocksuite/affine-model';
import { EDGELESS_TOP_CONTENTEDITABLE_SELECTOR } from '@blocksuite/affine-shared/consts';
import {
  BlockElementCommentManager,
  CommentProviderIdentifier,
  DatabaseMoveProvider,
  DocModeProvider,
  FeatureFlagService,
  JournalTodoDatabaseProvider,
  NotificationProvider,
  type TelemetryEventMap,
  TelemetryProvider,
} from '@blocksuite/affine-shared/services';
import {
  TASK_INTEROP_UPDATED_EVENT,
  type TaskInteropUpdatedDetail,
} from '@blocksuite/affine-shared/utils';
import { getDropResult } from '@blocksuite/affine-widget-drag-handle';
import {
  createRecordDetail,
  createUniComponentFromWebComponent,
  DataViewRootUILogic,
  type DataViewSelection,
  type DataViewUILogicBase,
  type DataViewWidget,
  type DataViewWidgetProps,
  defineUniComponent,
  ExternalGroupByConfigProvider,
  lazy,
  renderUniLit,
  type SingleView,
  uniMap,
} from '@blocksuite/data-view';
import { CalendarExternalSourceProvider } from '@blocksuite/data-view/view-presets';
import { widgetPresets } from '@blocksuite/data-view/widget-presets';
import { IS_MOBILE } from '@blocksuite/global/env';
import { Rect } from '@blocksuite/global/gfx';
import {
  CommentIcon,
  CopyIcon,
  DeleteIcon,
  MoreHorizontalIcon,
  MoveToIcon,
  SettingsIcon,
} from '@blocksuite/icons/lit';
import {
  type BlockComponent,
  BlockSelection,
  type EditorHost,
} from '@blocksuite/std';
import { RANGE_SYNC_EXCLUDE_ATTR } from '@blocksuite/std/inline';
import { Slice } from '@blocksuite/store';
import { autoUpdate } from '@floating-ui/dom';
import { computed, signal } from '@preact/signals-core';
import { html, nothing } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { styleMap } from 'lit/directives/style-map.js';

import { popSideDetail } from './components/layout.js';
import { DatabaseConfigExtension } from './config.js';
import { EditorHostKey, RowHostKey } from './context/host-context.js';
import type { DatabaseViewLocalOverride } from './context/view-local-override-context.js';
import { DatabaseViewLocalOverrideProvider } from './context/view-local-override-context.js';
import { DatabaseBlockDataSource } from './data-source.js';
import {
  databaseBlockStyles,
  databaseContentStyles,
  databaseHeaderBarStyles,
  databaseHeaderContainerStyles,
  databaseOpsStyles,
  databaseTitleRowStyles,
  databaseTitleStyles,
  databaseToolbarRowStyles,
  databaseViewBarContainerStyles,
} from './database-block-styles.js';
import { BlockRenderer } from './detail-panel/block-renderer.js';
import { NoteRenderer } from './detail-panel/note-renderer.js';
import { DatabaseSelection } from './selection.js';
import { getSingleDocIdFromText } from './utils/title-doc.js';
import type { DatabaseViewExtensionOptions } from './view';

export function resolveTaskInteropTargetRow(
  rowLookup: ReturnType<DatabaseBlockDataSource['findRowByTaskIdentity']>,
  fallbackRowId?: string
) {
  if (rowLookup.status === 'unique') {
    return rowLookup.rowId;
  }
  if (rowLookup.status === 'missing') {
    return fallbackRowId;
  }
  return null;
}

export class DatabaseBlockComponent extends CaptionedBlockComponent<DatabaseBlockModel> {
  private readonly clickDatabaseOps = (e: MouseEvent) => {
    const dataSource = this.dataSource.value;
    const options = this.optionsConfig.configure(this.model, {
      items: [
        menu.input({
          initialValue: this.model.props.title.toString(),
          placeholder: 'Database title',
          onChange: text => {
            this.model.props.title.replace(
              0,
              this.model.props.title.length,
              text
            );
          },
        }),
        menu.action({
          prefix: CommentIcon(),
          name: 'Comment',
          hide: () => !this.std.getOptional(CommentProviderIdentifier),
          select: () => {
            this.std.getOptional(CommentProviderIdentifier)?.addComment([
              new BlockSelection({
                blockId: this.blockId,
              }),
            ]);
          },
        }),
        menu.action({
          prefix: CopyIcon(),
          name: 'Copy',
          select: () => {
            const slice = Slice.fromModels(this.store, [this.model]);
            this.std.clipboard
              .copySlice(slice)
              .then(() => {
                toast(this.host, 'Copied to clipboard');
              })
              .catch(console.error);
          },
        }),
        menu.action({
          name: 'Settings',
          prefix: SettingsIcon(),
          closeOnSelect: false,
          select: ele => {
            const currentInheritance = dataSource.getTaskStatusInheritance?.();
            popMenu(popupTargetFromElement(ele), {
              options: {
                items: [
                  menu.group({
                    name: 'Parent status behavior',
                    items: [
                      menu.toggleSwitch({
                        name: 'Done when all children are done',
                        on:
                          currentInheritance?.done ===
                          'require-all-subtasks-complete',
                        onChange: on => {
                          dataSource.setTaskStatusInheritance?.({
                            done: on
                              ? 'require-all-subtasks-complete'
                              : 'disabled',
                          });
                        },
                      }),
                      menu.toggleSwitch({
                        name: 'In progress when any child starts',
                        on:
                          currentInheritance?.inProgress ===
                          'start-when-any-subtask-starts',
                        onChange: on => {
                          dataSource.setTaskStatusInheritance?.({
                            inProgress: on
                              ? 'start-when-any-subtask-starts'
                              : 'disabled',
                          });
                        },
                      }),
                      menu.toggleSwitch({
                        name: 'Auto-demote auto-derived Done',
                        on: currentInheritance?.autoDemoteAutoDone ?? true,
                        onChange: on => {
                          dataSource.setTaskStatusInheritance?.({
                            autoDemoteAutoDone: on,
                          });
                        },
                      }),
                      menu.toggleSwitch({
                        name: 'Manual Done cascades to descendants',
                        on:
                          currentInheritance?.cascadeManualDoneToDescendants ??
                          true,
                        onChange: on => {
                          dataSource.setTaskStatusInheritance?.({
                            cascadeManualDoneToDescendants: on,
                          });
                        },
                      }),
                    ],
                  }),
                ],
              },
            });
          },
        }),
        menu.action({
          prefix: MoveToIcon(),
          name: 'Move to page...',
          // Only offered on the database's own real, primary render
          // location — never when rendered nested inside a `database-ref`/
          // `database-view-ref` preview scope (moving the canonical out
          // from under a reference actively rendering it is not a
          // supported interaction surface here). Mirrors the exact same
          // two-flavour `closest()` gate `dataSource`'s own lazy getter
          // above already uses for the same reasoning.
          hide: () =>
            !this.std.getOptional(DatabaseMoveProvider) ||
            !!this.closest('affine-database-ref') ||
            !!this.closest('affine-database-view-ref'),
          select: () => {
            const databaseMove = this.std.getOptional(DatabaseMoveProvider);
            if (!databaseMove) return;

            databaseMove
              .moveDatabaseToAnotherDoc(this.model.id, this.store.id)
              .catch(e => {
                console.error(
                  '[database] failed to move database to another doc',
                  e
                );
                toast(this.host, 'Could not move this database.');
              });
          },
        }),
        menu.group({
          items: [
            menu.action({
              prefix: DeleteIcon(),
              class: {
                'delete-item': true,
              },
              name: 'Delete Database',
              select: () => {
                this.model.children.slice().forEach(block => {
                  this.store.deleteBlock(block);
                });
                this.store.deleteBlock(this.model);
              },
            }),
          ],
        }),
      ],
    });

    popMenu(popupTargetFromElement(e.currentTarget as HTMLElement), {
      options,
    });
  };

  private readonly dataSource = lazy(() => {
    const dataSource = new DatabaseBlockDataSource(this.model, dataSource => {
      // `this.host` is the OUTER page's real host for a natively-rendered
      // `affine-database` — but when this component is instead rendered
      // *nested*, inside a `database-view-ref`/`database-ref` reference's
      // own preview `BlockStdScope` (a fresh scope over the canonical's own,
      // often cross-doc, backing document — see `_maybeRefreshPreview`),
      // `this.host` is that NESTED preview's own host, not the real page
      // the user is looking at. Cell renderers/row actions that insert new
      // blocks "on the current page" (Story 2.6's note-linking button, in
      // particular) need the real outer host — resolved the same
      // duck-typed way `viewLocalOverride` already is below, via whichever
      // reference wrapper's own `outerStd` getter is present (confirmed
      // live: without this, a note-ref was being created silently inside
      // the canonical's own filtered preview doc, invisible on the actual
      // page).
      const outerHostHolder = this.closest(
        'affine-database-view-ref, affine-database-ref'
      ) as Element & { outerStd?: { host: EditorHost } };
      dataSource.serviceSet(
        EditorHostKey,
        outerHostHolder?.outerStd?.host ?? this.host
      );
      // ...but `this.host` is still the only host whose `store` actually
      // owns this database's row blocks (for a nested reference render it
      // is the preview scope over the canonical's own backing document;
      // for a native render it is simply the same host again). Anything
      // that resolves a row's `BlockModel`, or runs a block command against
      // it, must go through this key instead — reading rows off the outer
      // host returns `undefined` for every row in the cross-doc case, which
      // is what made list-view Enter treat every row as empty and unindent
      // it rather than split it.
      dataSource.serviceSet(RowHostKey, this.host);
      this.std.provider
        .getAll(ExternalGroupByConfigProvider)
        .forEach(config => {
          dataSource.serviceSet(
            ExternalGroupByConfigProvider(config.name),
            config
          );
        });
      this.std.provider
        .getAll(CalendarExternalSourceProvider)
        .forEach(source => {
          dataSource.serviceSet(
            CalendarExternalSourceProvider(source.id),
            source
          );
        });
      // `affine:database-view-ref` (a reference block needing its own
      // independent view/filter configuration, separate from the canonical
      // table's shared `views`) exposes a ready-made `viewLocalOverride` on
      // its own custom element for exactly this seam — duck-typed, not a
      // real import, so this foundational package never depends on that
      // block's package (mirrors the existing, already-accepted duck-typing
      // `database-ref-block.ts` itself does in the other direction, reaching
      // into this component's own `virtualPadding$`/`dataSource`). Must be
      // set inside this `init` callback (before the constructed instance is
      // ever used), not after — `viewDataList$`/etc. are read the moment
      // anything renders, and there's no reactive re-check afterward.
      const overrideHost = this.closest('affine-database-view-ref') as
        | (Element & { viewLocalOverride?: DatabaseViewLocalOverride })
        | null;
      if (overrideHost?.viewLocalOverride) {
        dataSource.serviceSet(
          DatabaseViewLocalOverrideProvider,
          overrideHost.viewLocalOverride
        );
      }
    });
    // Must run AFTER the `init` callback above, not inside it: the
    // `DatabaseViewLocalOverrideProvider` set in there is what makes
    // `viewDataList$` resolve to *this reference's own* per-instance views
    // rather than the canonical's shared ones, and this invariant has to be
    // enforced against the former. See
    // `enforceAlwaysHiddenPlumbingColumns`'s own comment for why a
    // creation-time hide is not sufficient — in short, `Note color` is
    // created lazily on the first note-colour attach anywhere, so every
    // reference that already existed at that moment would otherwise render
    // it as a visible field forever. Self-correcting here means any such
    // reference fixes itself the next time it renders. No-ops entirely when
    // nothing needs changing, so this is not a write on every mount.
    dataSource.enforceAlwaysHiddenPlumbingColumns();
    // Skip when rendered nested inside a `database-ref` wrapper: `this.model`
    // there is the *shared* canonical table, the same object for every
    // reference to it, so applying/persisting a "last used view" through it
    // here would let one reference's tab choice leak into every other
    // reference (and, on the next remount, get stamped back onto all of
    // them, discarding their own distinct choices — confirmed live via a
    // `setCurrentView` call trace: a reference's construction-time default
    // apply was picking up whatever view another reference's tab click had
    // last written into this exact shared prop). `database-ref-block.ts`'s
    // own `_syncCurrentView` is the sole source of truth for the nested
    // case, persisting to each reference's own model instead. Same
    // reasoning applies to `affine-database-view-ref` — its own local
    // `views`/`currentViewId` are unrelated to the canonical's, so applying
    // the canonical's `currentViewId` here would resolve against the wrong
    // view list entirely (its own component owns that instead).
    if (
      !this.closest('affine-database-ref') &&
      !this.closest('affine-database-view-ref')
    ) {
      const id = this.model.props.currentViewId;
      if (id && dataSource.viewManager.viewGet(id)) {
        dataSource.viewManager.setCurrentView(id);
      }
    }
    return dataSource;
  });

  private readonly renderTitle = (dataViewLogic: DataViewUILogicBase) => {
    return html` <affine-database-title
      class="${databaseTitleStyles}"
      .titleText="${this.model.props.title}"
      .dataViewLogic="${dataViewLogic}"
    ></affine-database-title>`;
  };

  createTemplate = (
    data: {
      view: SingleView;
      rowId: string;
    },
    openDoc: (docId: string) => void
  ) => {
    return createRecordDetail({
      ...data,
      openDoc,
      detail: {
        header: uniMap(
          createUniComponentFromWebComponent(BlockRenderer),
          props => ({
            ...props,
            host: this.host,
          })
        ),
        note: uniMap(
          createUniComponentFromWebComponent(NoteRenderer),
          props => ({
            ...props,
            model: this.model,
            host: this.host,
          })
        ),
      },
    });
  };

  headerWidget: DataViewWidget = defineUniComponent(
    (props: DataViewWidgetProps) => {
      return html`
        <div class="${databaseHeaderContainerStyles}">
          <div class="${databaseTitleRowStyles}">
            ${this.renderTitle(props.dataViewLogic)} ${this.renderDatabaseOps()}
          </div>
          <div class="${databaseToolbarRowStyles} ${databaseHeaderBarStyles}">
            <div class="${databaseViewBarContainerStyles}">
              ${renderUniLit(widgetPresets.viewBar, {
                ...props,
                onChangeView: id => {
                  if (!this.closest('affine-database-ref')) {
                    this.model.props.currentViewId = id;
                  }
                },
              })}
            </div>
            ${renderUniLit(this.toolsWidget, props)}
          </div>
          ${renderUniLit(widgetPresets.quickSettingBar, props)}
        </div>
      `;
    }
  );

  indicator = new DropIndicator();

  onDrag = (evt: MouseEvent, id: string): (() => void) => {
    const result = getDropResult(evt);
    if (result && result.rect) {
      document.body.append(this.indicator);
      this.indicator.rect = Rect.fromLWTH(
        result.rect.left,
        result.rect.width,
        result.rect.top,
        result.rect.height
      );
      return () => {
        this.indicator.remove();
        const model = this.store.getBlock(id)?.model;
        const target = result.modelState.model;
        let parent = this.store.getParent(target.id);
        const shouldInsertIn = result.placement === 'in';
        if (shouldInsertIn) {
          parent = target;
        }
        if (model && target && parent) {
          if (shouldInsertIn) {
            this.store.moveBlocks([model], parent);
          } else {
            this.store.moveBlocks(
              [model],
              parent,
              target,
              result.placement === 'before'
            );
          }
        }
      };
    }
    this.indicator.remove();
    return () => {};
  };

  private readonly setSelection = (
    selection: DataViewSelection | undefined
  ) => {
    if (selection) {
      getSelection()?.removeAllRanges();
    }
    this.selection.setGroup(
      'note',
      selection
        ? [
            new DatabaseSelection({
              blockId: this.blockId,
              viewSelection: selection,
            }),
          ]
        : []
    );
  };

  private readonly toolsWidget: DataViewWidget = widgetPresets.createTools({
    table: [
      widgetPresets.tools.filter,
      widgetPresets.tools.sort,
      widgetPresets.tools.search,
      widgetPresets.tools.viewOptions,
      widgetPresets.tools.tableAddRow,
    ],
    kanban: [
      widgetPresets.tools.filter,
      widgetPresets.tools.sort,
      widgetPresets.tools.search,
      widgetPresets.tools.viewOptions,
      widgetPresets.tools.tableAddRow,
    ],
    calendar: [
      widgetPresets.tools.filter,
      widgetPresets.tools.search,
      widgetPresets.tools.viewOptions,
      widgetPresets.tools.tableAddRow,
    ],
    list: [
      widgetPresets.tools.filter,
      widgetPresets.tools.search,
      widgetPresets.tools.viewOptions,
      widgetPresets.tools.tableAddRow,
    ],
  });

  private readonly viewSelection$ = computed(() => {
    const databaseSelection = this.selection.value.find(
      (selection): selection is DatabaseSelection => {
        if (selection.blockId !== this.blockId) {
          return false;
        }
        return selection instanceof DatabaseSelection;
      }
    );
    return databaseSelection?.viewSelection;
  });

  private readonly virtualPadding$ = signal(0);

  get optionsConfig(): DatabaseViewExtensionOptions {
    return {
      configure: (_model, options) => options,
      ...this.std.getOptional(DatabaseConfigExtension.identifier),
    };
  }

  get isCommentHighlighted() {
    return (
      this.std
        .getOptional(BlockElementCommentManager)
        ?.isBlockCommentHighlighted(this.model) ?? false
    );
  }

  override get topContenteditableElement() {
    if (this.std.get(DocModeProvider).getEditorMode() === 'edgeless') {
      return this.closest<BlockComponent>(
        EDGELESS_TOP_CONTENTEDITABLE_SELECTOR
      );
    }
    return this.rootComponent;
  }

  private renderDatabaseOps() {
    if (this.dataSource.value.readonly$.value) {
      return nothing;
    }
    return html` <div
      data-testid="database-ops"
      class="${databaseOpsStyles}"
      @click="${this.clickDatabaseOps}"
    >
      ${MoreHorizontalIcon()}
    </div>`;
  }

  override connectedCallback() {
    super.connectedCallback();

    this.setAttribute(RANGE_SYNC_EXCLUDE_ATTR, 'true');
    this.classList.add(databaseBlockStyles);
    this.listenFullWidthChange();
    this.handleMobileEditing();
    this.handleTaskInteropUpdates();
  }

  private handleTaskInteropUpdates() {
    this.disposables.addFromEvent(
      this.host,
      TASK_INTEROP_UPDATED_EVENT,
      (event: Event) => {
        const customEvent = event as CustomEvent<TaskInteropUpdatedDetail>;
        const detail = customEvent.detail;
        if (!detail?.link) {
          return;
        }

        const dataSource = this.dataSource.value;
        const rowLookup = dataSource.findRowByTaskIdentity(
          detail.link.taskIdentity
        );
        const rowId = resolveTaskInteropTargetRow(
          rowLookup,
          detail.link.databaseRowId
        );

        if (!rowId) {
          return;
        }

        dataSource.setTaskInteropLink(rowId, {
          taskIdentity: detail.link.taskIdentity,
          docId: detail.link.docId,
          blockId: detail.link.blockId,
          sourceFlavor: detail.link.sourceFlavor,
          databaseId: this.blockId,
          databaseRowId: rowId,
        });
      }
    );
  }

  listenFullWidthChange() {
    if (this.std.get(DocModeProvider).getEditorMode() === 'edgeless') {
      return;
    }
    this.disposables.add(
      autoUpdate(this.host, this, () => {
        const padding =
          this.getBoundingClientRect().left -
          this.host.getBoundingClientRect().left;
        this.virtualPadding$.value = Math.max(0, padding - 72);
      })
    );
  }

  handleMobileEditing() {
    if (!IS_MOBILE) return;

    let notifyClosed = true;
    const handler = () => {
      if (
        !this.std
          .get(FeatureFlagService)
          .getFlag('enable_mobile_database_editing')
      ) {
        const notification = this.std.getOptional(NotificationProvider);
        if (notification && notifyClosed) {
          notifyClosed = false;
          notification.notify({
            title: html`<div
              style=${styleMap({
                whiteSpace: 'wrap',
              })}
            >
              Mobile database editing is not supported yet. You can open it in
              experimental features, or edit it in desktop mode.
            </div>`,
            accent: 'warning',
            onClose: () => {
              notifyClosed = true;
            },
          });
        }
      }
    };

    this.disposables.addFromEvent(this, 'click', handler);
  }

  private readonly dataViewRootLogic = lazy(
    () =>
      new DataViewRootUILogic({
        virtualPadding$: this.virtualPadding$,
        bindHotkey: hotkeys => {
          return {
            dispose: this.host.event.bindHotkey(hotkeys, {
              blockId: this.topContenteditableElement?.blockId ?? this.blockId,
            }),
          };
        },
        handleEvent: (name, handler) => {
          return {
            dispose: this.host.event.add(name, handler, {
              blockId: this.blockId,
            }),
          };
        },
        selection$: this.viewSelection$,
        setSelection: this.setSelection,
        dataSource: this.dataSource.value,
        headerWidget: this.headerWidget,
        onDrag: this.onDrag,
        clipboard: this.std.clipboard,
        dnd: this.std.dnd,
        notification: {
          toast: message => {
            const notification = this.std.getOptional(NotificationProvider);
            if (notification) {
              notification.toast(message);
            } else {
              toast(this.host, message);
            }
          },
        },
        eventTrace: (key, params) => {
          const telemetryService = this.std.getOptional(TelemetryProvider);
          telemetryService?.track(key, {
            ...(params as TelemetryEventMap[typeof key]),
            blockId: this.blockId,
          });
        },
        detailPanelConfig: {
          openDetailPanel: (target, data) => {
            const peekViewService = this.std.getOptional(PeekViewProvider);
            if (peekViewService) {
              const openDoc = (docId: string) => {
                return peekViewService.peek({
                  docId,
                  databaseId: this.blockId,
                  databaseDocId: this.model.store.id,
                  databaseRowId: data.rowId,
                  target: this,
                });
              };
              // Story 2.7 (Task 4): a calendar view showing the current
              // workspace-wide "journal todo" canonical (any calendar view
              // of it, however it was added — the generic view-switcher,
              // not a special insert command) navigates to the row's
              // journal-page appearance instead of the generic row detail
              // panel — see `resolveJournalTodoNavigationDate`'s own
              // comment. Falls through to the generic behavior below if the
              // target journal page doesn't exist yet (never silently
              // no-ops, never auto-creates a page as a click side effect).
              //
              // Live bug: `data.isNewRow` skips this entirely — a row the
              // calendar's own "New row" button just created has no Done
              // date yet, so `resolveJournalTodoNavigationDate` always
              // resolves it to *today*, regardless of which day was
              // actually clicked on the calendar. Following that
              // navigation for a brand-new row peeked today's journal
              // page — which has no title field for the new row at all —
              // instead of the row detail panel the user actually needs
              // to fill it in, leaving the row permanently "Untitled"
              // once that peek is closed.
              if (data.view.type === 'calendar' && !data.isNewRow) {
                const journalTodo = this.std.getOptional(
                  JournalTodoDatabaseProvider
                );
                const journalTodoRef = journalTodo?.getJournalTodoDatabaseRef();
                const isJournalTodoCanonical =
                  journalTodoRef?.refBlockId === this.model.id &&
                  journalTodoRef?.refDocId === this.model.store.id;
                if (isJournalTodoCanonical) {
                  const targetDate =
                    this.dataSource.value.resolveJournalTodoNavigationDate(
                      data.rowId
                    );
                  const targetDocId = journalTodo?.getJournalDocId(targetDate);
                  // `getJournalDocId` resolves against core workspace
                  // metadata (`DocsService.list.docs$`), a different source
                  // of truth than this block's own `std.workspace` doc
                  // collection — confirm the doc is actually loadable here
                  // before navigating, so a stale/out-of-sync id falls
                  // through to the generic row-detail behavior below
                  // instead of peeking a doc that can't render.
                  if (targetDocId && this.std.workspace.getDoc(targetDocId)) {
                    return openDoc(targetDocId);
                  }
                }
              }
              const doc = getSingleDocIdFromText(
                this.model.store.getBlock(data.rowId)?.model?.text
              );
              if (doc) {
                return openDoc(doc);
              }
              const abort = new AbortController();
              return new Promise<void>(focusBack => {
                peekViewService
                  .peek(
                    {
                      target,
                      template: this.createTemplate(data, docId => {
                        // abort.abort();
                        openDoc(docId).then(focusBack).catch(focusBack);
                      }),
                    },
                    { abortSignal: abort.signal }
                  )
                  .then(focusBack)
                  .catch(focusBack);
              });
            } else {
              return popSideDetail(
                this.createTemplate(data, () => {
                  //
                })
              );
            }
          },
        },
      })
  );
  override renderBlock() {
    const widgets = html`${repeat(
      Object.entries(this.widgets),
      ([id]) => id,
      ([_, widget]) => widget
    )}`;

    const dataViewContent = this.dataViewRootLogic.value.render();

    return html`
      <div contenteditable="false" class="${databaseContentStyles}">
        ${dataViewContent} ${widgets}
      </div>
    `;
  }

  override accessor useZeroWidth = true;
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-database': DatabaseBlockComponent;
  }
}
