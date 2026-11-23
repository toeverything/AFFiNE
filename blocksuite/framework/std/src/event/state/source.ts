import { UIEventState } from '../base.js';

export enum EventScopeSourceType {
  // The event scope should be built by selection path
  Selection = 'selection',

  // The event scope should be built by event target
  Target = 'target',
}

export type EventSourceStateOptions = {
  event: Event;
  sourceType: EventScopeSourceType;
};

export class EventSourceState extends UIEventState {
  readonly sourceType: EventScopeSourceType;

  override type = 'sourceState';

  constructor({ event, sourceType }: EventSourceStateOptions) {
    super(event);
    this.sourceType = sourceType;
  }
}

declare global {
  interface BlockSuiteUIEventState {
    sourceState: EventSourceState;
  }
}
