export enum DefaultModeDragType {
  /** Moving connector label */
  ConnectorLabelMoving = 'connector-label-moving',
  /** Moving selected contents */
  ContentMoving = 'content-moving',
  /** Native range dragging inside active note block */
  NativeEditing = 'native-editing',
  /** Default void state */
  None = 'none',
  /** Dragging preview */
  PreviewDragging = 'preview-dragging',
  /** Expanding the dragging area, select the content covered inside */
  Selecting = 'selecting',
}
