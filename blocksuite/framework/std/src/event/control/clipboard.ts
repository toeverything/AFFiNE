import { UIEventState, UIEventStateContext } from '../base.js';
import type { UIEventDispatcher } from '../dispatcher.js';
import { ClipboardEventState } from '../state/clipboard.js';
import { EventScopeSourceType, EventSourceState } from '../state/source.js';

export class ClipboardControl {
  private readonly _copy = (event: ClipboardEvent) => {
    const clipboardEventState = new ClipboardEventState({
      event,
    });
    this._dispatcher.run(
      'copy',
      this._createContext(event, clipboardEventState)
    );
  };

  private readonly _cut = (event: ClipboardEvent) => {
    const clipboardEventState = new ClipboardEventState({
      event,
    });
    this._dispatcher.run(
      'cut',
      this._createContext(event, clipboardEventState)
    );
  };

  private readonly _paste = (event: ClipboardEvent) => {
    const clipboardEventState = new ClipboardEventState({
      event,
    });

    this._dispatcher.run(
      'paste',
      this._createContext(event, clipboardEventState)
    );
  };

  constructor(private readonly _dispatcher: UIEventDispatcher) {}

  private _createContext(event: Event, clipboardState: ClipboardEventState) {
    return UIEventStateContext.from(
      new UIEventState(event),
      new EventSourceState({
        event,
        sourceType: EventScopeSourceType.Selection,
      }),
      clipboardState
    );
  }

  listen() {
    this._dispatcher.disposables.addFromEvent(document, 'cut', this._cut);
    this._dispatcher.disposables.addFromEvent(document, 'copy', this._copy);
    this._dispatcher.disposables.addFromEvent(document, 'paste', this._paste);
  }
}
