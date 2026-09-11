import {
  BlockRenderer,
  createRecordDetail,
  createUniComponentFromWebComponent,
  DatabaseBlockDataSource,
  DatabaseSelection,
  DataViewRootUILogic,
  EditorHostKey,
  lazy,
  NoteRenderer,
  uniMap,
} from '@blocksuite/affine/blocks/database';
import { PeekViewProvider } from '@blocksuite/affine/components/peek';
import { toast } from '@blocksuite/affine/components/toast';
import type { DatabaseBlockModel } from '@blocksuite/affine/model';
import {
  NotificationProvider,
  type TelemetryEventMap,
  TelemetryProvider,
} from '@blocksuite/affine/shared/services';
import type { BlockStdScope } from '@blocksuite/affine/std';
import type { DataViewSelection } from '@blocksuite/affine/data-view';
import { computed, signal } from '@preact/signals-core';
import type { TemplateResult } from 'lit';

export function createBoardKanbanLogic(
  std: BlockStdScope,
  database: DatabaseBlockModel
) {
  const virtualPadding$ = signal(0);
  const dataSource = lazy(() => {
    const source = new DatabaseBlockDataSource(database, next => {
      next.serviceSet(EditorHostKey, std.host);
    });
    const kanban = source.viewManager.views$.value.find(id => {
      return source.viewManager.viewGet(id)?.type === 'kanban';
    });
    if (kanban) {
      source.viewManager.setCurrentView(kanban);
    }
    return source;
  });

  const setSelection = (selection: DataViewSelection | undefined) => {
    if (selection) {
      getSelection()?.removeAllRanges();
    }
    std.selection.setGroup(
      'note',
      selection
        ? [
            new DatabaseSelection({
              blockId: database.id,
              viewSelection: selection,
            }),
          ]
        : []
    );
  };

  const viewSelection$ = computed(() => {
    const current = std.selection.value.find(
      (selection): selection is DatabaseSelection =>
        selection instanceof DatabaseSelection &&
        selection.blockId === database.id
    );
    return current?.viewSelection;
  });

  const logic = lazy(
    () =>
      new DataViewRootUILogic({
        virtualPadding$,
        bindHotkey: hotkeys => ({
          dispose: std.host.event.bindHotkey(hotkeys, {
            blockId: database.id,
          }),
        }),
        handleEvent: (name, handler) => ({
          dispose: std.host.event.add(name, handler, {
            blockId: database.id,
          }),
        }),
        selection$: viewSelection$,
        setSelection,
        dataSource: dataSource.value,
        headerWidget: undefined,
        clipboard: std.clipboard,
        dnd: std.dnd,
        notification: {
          toast: message => {
            const notification = std.getOptional(NotificationProvider);
            if (notification) {
              notification.toast(message);
            } else {
              toast(std.host, message);
            }
          },
        },
        eventTrace: (key, params) => {
          std.getOptional(TelemetryProvider)?.track(key, {
            ...(params as TelemetryEventMap[typeof key]),
            blockId: database.id,
          });
        },
        detailPanelConfig: {
          openDetailPanel: (target, data) => {
            const peekViewService = std.getOptional(PeekViewProvider);
            if (!peekViewService) return Promise.resolve();
            return peekViewService.peek({
              target,
              template: createRecordDetail({
                ...data,
                openDoc: docId => {
                  void peekViewService.peek({
                    docId,
                    databaseId: database.id,
                    databaseDocId: database.store.id,
                    databaseRowId: data.rowId,
                    target: std.host,
                  });
                },
                detail: {
                  header: uniMap(
                    createUniComponentFromWebComponent(BlockRenderer),
                    props => ({
                      ...props,
                      host: std.host,
                    })
                  ),
                  note: uniMap(
                    createUniComponentFromWebComponent(NoteRenderer),
                    props => ({
                      ...props,
                      model: database,
                      host: std.host,
                    })
                  ),
                },
              }),
            });
          },
        },
      })
  );

  return {
    render(): TemplateResult {
      return logic.value.render();
    },
  };
}
