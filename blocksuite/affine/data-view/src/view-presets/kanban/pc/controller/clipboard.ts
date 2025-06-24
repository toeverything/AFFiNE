import type { UIEventStateContext } from '@blocksuite/std';
import type { ReactiveController } from 'lit';

import type { KanbanViewSelectionWithType } from '../../selection';
import type { KanbanViewUILogic } from '../kanban-view-ui-logic.js';

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
    return this.logic.view.readonly$.value;
  }

  get host() {
    return this.logic.ui$.value;
  }

  constructor(public logic: KanbanViewUILogic) {}

  hostConnected() {
    if (this.host) {
      this.host.disposables.add(
        this.logic.handleEvent('copy', ctx => {
          const kanbanSelection = this.logic.selectionController.selection;
          if (!kanbanSelection) return false;

          this._onCopy(ctx, kanbanSelection);
          return true;
        })
      );

      this.host.disposables.add(
        this.logic.handleEvent('paste', ctx => {
          if (this.readonly) return false;

          this._onPaste(ctx);
          return true;
        })
      );
    }
  }
}
