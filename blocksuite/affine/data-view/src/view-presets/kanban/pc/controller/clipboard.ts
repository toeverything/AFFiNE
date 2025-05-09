import type { UIEventStateContext } from '@blocksuite/std';
import type { ReactiveController } from 'lit';

import type { KanbanViewSelectionWithType } from '../../selection';
import type { DataViewKanban } from '../kanban-view.js';

export class KanbanClipboardController implements ReactiveController {
  private readonly _onCopy = (
    _context: UIEventStateContext,
    _kanbanSelection: KanbanViewSelectionWithType
  ) => {
    // todo
    return true;
  };

  private readonly _onPaste = (_context: UIEventStateContext) => {
    // todo
    return true;
  };

  private get readonly() {
    return this.host.props.view.readonly$.value;
  }

  constructor(public host: DataViewKanban) {
    host.addController(this);
  }

  hostConnected() {
    this.host.disposables.add(
      this.host.props.handleEvent('copy', ctx => {
        const kanbanSelection = this.host.selectionController.selection;
        if (!kanbanSelection) return false;

        this._onCopy(ctx, kanbanSelection);
        return true;
      })
    );

    this.host.disposables.add(
      this.host.props.handleEvent('paste', ctx => {
        if (this.readonly) return false;

        this._onPaste(ctx);
        return true;
      })
    );
  }
}
