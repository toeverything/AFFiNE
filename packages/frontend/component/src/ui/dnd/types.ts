export interface DNDData<
  Draggable extends Record<string, unknown> = Record<string, unknown>,
  DropTarget extends Record<string, unknown> = Record<string, unknown>,
> {
  draggable: Draggable;
  dropTarget: DropTarget;
}
