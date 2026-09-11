export { WHITEBOARD_FLAVOURS, WHITEBOARD_SURFACE_CHILDREN } from './const';
export { insertGfxWidget } from './insert-widget';
export {
  collectStoreExtensions,
  collectViewExtensions,
  registerGfxWidget,
  type GfxWidgetRegistration,
  type SnapshotPainter,
} from './register-gfx-widget';
export { WhiteboardStoreExtension } from './store';
export {
  WhiteboardViewExtension,
  type WhiteboardViewOptions,
} from './view';
export {
  HelloBlockSchema,
  HelloBlockSchemaExtension,
  helloWidget,
} from './blocks/hello';
