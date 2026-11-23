import { BlockSuiteError, ErrorCode } from '@blocksuite/global/exceptions';

type MatchEvent<T extends string> = T extends UIEventStateType
  ? BlockSuiteUIEventState[T]
  : UIEventState;

export class UIEventState {
  /** when extends, override it with pattern `xxxState` */
  type = 'defaultState';

  constructor(public event: Event) {}
}

export class UIEventStateContext {
  private _map: Record<string, UIEventState> = {};

  add = <State extends UIEventState = UIEventState>(state: State) => {
    const name = state.type;
    if (this._map[name]) {
      console.warn('UIEventStateContext: state name duplicated', name);
    }

    this._map[name] = state;
  };

  get = <Type extends UIEventStateType = UIEventStateType>(
    type: Type
  ): MatchEvent<Type> => {
    const state = this._map[type];
    if (!state) {
      throw new BlockSuiteError(
        ErrorCode.EventDispatcherError,
        `UIEventStateContext: state ${type} not found`
      );
    }
    return state as MatchEvent<Type>;
  };

  has = (type: UIEventStateType) => {
    return !!this._map[type];
  };

  static from(...states: UIEventState[]) {
    const context = new UIEventStateContext();
    states.forEach(state => {
      context.add(state);
    });
    return context;
  }
}

export type UIEventHandler = (
  context: UIEventStateContext
) => boolean | null | undefined | void;

declare global {
  interface BlockSuiteUIEventState {
    defaultState: UIEventState;
  }

  type UIEventStateType = keyof BlockSuiteUIEventState;
}
