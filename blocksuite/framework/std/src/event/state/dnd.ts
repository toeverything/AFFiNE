import { UIEventState } from '../base.js';

type DndEventStateOptions = {
  event: DragEvent;
};

export class DndEventState extends UIEventState {
  raw: DragEvent;

  override type = 'dndState';

  constructor({ event }: DndEventStateOptions) {
    super(event);

    this.raw = event;
  }
}

declare global {
  interface BlockSuiteUIEventState {
    dndState: DndEventState;
  }
}
