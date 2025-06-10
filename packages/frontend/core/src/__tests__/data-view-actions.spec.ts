/* eslint-disable rxjs/finnish */
import { computed, signal } from '@preact/signals-core';
import { describe, expect, test, vi } from 'vitest';

// mock context-menu utilities
const popFilterableSimpleMenu = vi.fn();
vi.mock('@blocksuite/affine-components/context-menu', () => ({
  menu: {
    action: (opts: any) => opts,
    group: (opts: any) => opts,
    subMenu: (opts: any) => opts,
  },
  // avoid early access during module mocking
  popFilterableSimpleMenu: (...args: any[]) => popFilterableSimpleMenu(...args),
  popupTargetFromElement: (el: any) => el,
}));

import { SingleViewBase } from '../../../../../blocksuite/affine/data-view/src/core/view-manager/single-view.js';
import { MobileKanbanViewUILogic } from '../../../../../blocksuite/affine/data-view/src/view-presets/kanban/mobile/kanban-view-ui-logic.js';
import { popCardMenu } from '../../../../../blocksuite/affine/data-view/src/view-presets/kanban/mobile/menu.js';
import { popMobileRowMenu } from '../../../../../blocksuite/affine/data-view/src/view-presets/table/mobile/menu.js';

class TestView extends SingleViewBase {
  detailProperties$ = computed(() => []);
  mainProperties$ = computed(() => ({}));
  properties$ = computed(() => []);
  propertiesRaw$ = computed(() => []);
  readonly$ = computed(() => false);
  get type() {
    return 'test';
  }
  isShow() {
    return true;
  }
  propertyGetOrCreate() {
    return {} as any;
  }
}

describe('data view helpers', () => {
  test('rowAdd and rowsDelete unlock the view', () => {
    const ds = {
      rowAdd: vi.fn().mockReturnValue('id'),
      rowDelete: vi.fn(),
    } as any;
    const manager = { dataSource: ds } as any;
    const view = new TestView(manager, 'v1');
    view.lockRows(true);
    const id = view.rowAdd('end');
    expect(id).toBe('id');
    expect(ds.rowAdd).toHaveBeenCalledWith('end');
    expect(view.isLocked).toBe(false);

    view.lockRows(true);
    view.rowsDelete(['a']);
    expect(ds.rowDelete).toHaveBeenCalledWith(['a']);
    expect(view.isLocked).toBe(false);
  });

  test('MobileKanbanViewUILogic.addRow triggers update', () => {
    const root = {
      setSelection: vi.fn(),
      selection$: signal(undefined),
      config: {},
    } as any;
    const view = {
      readonly$: signal(false),
      rowAdd: vi.fn().mockReturnValue('r1'),
      groupTrait: {},
      id: 'v',
      manager: {},
    } as any;
    const logic = new MobileKanbanViewUILogic(root, view);
    const update = vi.fn();
    logic.ui$.value = { requestUpdate: update } as any;

    if (!logic.ui$.value) {
      throw new Error('UI state must be defined before calling addRow');
    }

    const id = logic.addRow('end');
    expect(id).toBe('r1');
    expect(view.rowAdd).toHaveBeenCalledWith('end');
    expect(update).toHaveBeenCalled();
  });

  test('popCardMenu actions request update', () => {
    const update = vi.fn();
    const kanbanViewLogic = {
      view: {
        addCard: vi.fn(),
        rowsDelete: vi.fn(),
        traitGet: () => ({ groupsDataList$: signal([]), moveCardTo: vi.fn() }),
      },
      ui$: signal({ requestUpdate: update }),
      root: { openDetailPanel: vi.fn() },
    } as any;
    popCardMenu({} as any, 'g', 'c', kanbanViewLogic);
    const groups = popFilterableSimpleMenu.mock.calls[0][1] as any;
    groups[2].items[0].select();
    expect(kanbanViewLogic.view.addCard).toHaveBeenCalledWith(
      { before: true, id: 'c' },
      'g'
    );
    expect(update).toHaveBeenCalledTimes(1);
    groups[2].items[1].select();
    expect(kanbanViewLogic.view.addCard).toHaveBeenCalledWith(
      { before: false, id: 'c' },
      'g'
    );
    groups[3].items[0].select();
    expect(kanbanViewLogic.view.rowsDelete).toHaveBeenCalledWith(['c']);
    expect(update).toHaveBeenCalledTimes(3);
  });

  test('popMobileRowMenu delete action requests update', () => {
    const update = vi.fn();
    const tableViewLogic = {
      ui$: signal({ requestUpdate: update }),
      root: { openDetailPanel: vi.fn() },
    } as any;
    const view = { rowsDelete: vi.fn() } as any;
    popMobileRowMenu({} as any, 'r1', tableViewLogic, view);
    const groups = popFilterableSimpleMenu.mock.calls.pop()![1] as any;
    groups[1].items[0].select();
    expect(view.rowsDelete).toHaveBeenCalledWith(['r1']);
    expect(update).toHaveBeenCalled();
  });
});
