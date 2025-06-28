import { describe, expect, it, vi } from 'vitest';

import { TableHotkeysController } from '../view-presets/table/pc/controller/hotkeys.js';
import { TableHotkeysController as VirtualHotkeysController } from '../view-presets/table/pc-virtual/controller/hotkeys.js';
import {
  TableViewAreaSelection,
  TableViewRowSelection,
} from '../view-presets/table/selection';

function createLogic() {
  const view = {
    rowsDelete: vi.fn(),
    rows$: { value: [] },
    groupTrait: { groupsDataList$: { value: [] } },
  };
  const ui = { disposables: { add: vi.fn() }, requestUpdate: vi.fn() };
  const selectionController = {
    selection: undefined as any,
    getCellContainer: vi.fn(),
    insertRowAfter: vi.fn(),
    focusToCell: vi.fn(),
    rowSelectionChange: vi.fn(),
    areaToRows: vi.fn().mockReturnValue([]),
    rowsToArea: vi.fn(),
    navigateRowSelection: vi.fn(),
    selectionAreaUp: vi.fn(),
    selectionAreaDown: vi.fn(),
    selectionAreaLeft: vi.fn(),
    selectionAreaRight: vi.fn(),
    isRowSelection: vi.fn().mockReturnValue(false),
  };
  const logic: any = {
    view,
    ui$: { value: ui },
    selectionController,
    bindHotkey: vi.fn((hotkeys: any) => {
      logic.hotkeys = hotkeys;
      return { dispose: vi.fn() };
    }),
    handleEvent: vi.fn((name: string, handler: any) => {
      if (name === 'keyDown') logic.keyDown = handler;
      return { dispose: vi.fn() };
    }),
  };
  return { logic, view, ui, selectionController };
}

describe('TableHotkeysController', () => {
  it('deletes rows on Backspace', () => {
    const { logic, view, ui, selectionController } = createLogic();
    const ctrl = new TableHotkeysController(logic as any);
    ctrl.hostConnected();
    selectionController.selection = TableViewRowSelection.create({
      rows: [{ id: 'r1' }],
    });
    logic.hotkeys.Backspace();
    expect(selectionController.selection).toBeUndefined();
    expect(view.rowsDelete).toHaveBeenCalledWith(['r1']);
    expect(ui.requestUpdate).toHaveBeenCalled();
  });

  it('starts editing on character key', () => {
    const { logic, selectionController } = createLogic();
    const ctrl = new TableHotkeysController(logic as any);
    ctrl.hostConnected();
    const cell = {
      rowId: 'r1',
      dataset: { rowId: 'r1', columnId: 'c1' },
      column: { valueSetFromString: vi.fn() },
    };
    selectionController.getCellContainer.mockReturnValue(cell);
    selectionController.selection = TableViewAreaSelection.create({
      focus: { rowIndex: 0, columnIndex: 0 },
      isEditing: false,
    });
    const evt = {
      key: 'A',
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      preventDefault: vi.fn(),
    };
    logic.keyDown({ get: () => ({ raw: evt }) });
    expect(cell.column.valueSetFromString).toHaveBeenCalledWith('r1', 'A');
    expect(selectionController.selection.isEditing).toBe(true);
    expect(evt.preventDefault).toHaveBeenCalled();
  });
});

describe('Virtual TableHotkeysController', () => {
  it('writes character to cell', () => {
    const { logic, selectionController } = createLogic();
    const ctrl = new VirtualHotkeysController(logic as any);
    ctrl.hostConnected();
    const cell = {
      rowId: 'r1',
      dataset: { rowId: 'r1', columnId: 'c1' },
      column$: { value: { valueSetFromString: vi.fn() } },
    };
    selectionController.getCellContainer.mockReturnValue(cell);
    selectionController.selection = TableViewAreaSelection.create({
      focus: { rowIndex: 1, columnIndex: 0 },
      isEditing: false,
    });
    const evt = {
      key: 'b',
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      preventDefault: vi.fn(),
    };
    logic.keyDown({ get: () => ({ raw: evt }) });
    expect(cell.column$.value.valueSetFromString).toHaveBeenCalledWith(
      'r1',
      'b'
    );
    expect(selectionController.selection.isEditing).toBe(true);
    expect(evt.preventDefault).toHaveBeenCalled();
  });
});
