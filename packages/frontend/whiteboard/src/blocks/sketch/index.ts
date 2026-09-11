import { registerGfxWidget } from '../../register-gfx-widget';
import { EdgelessClipboardSketchConfig } from './edgeless-clipboard-config';
import { SketchBlockHtmlAdapterExtension } from './html-adapter';
import { SketchBlockSchema, SketchBlockSchemaExtension } from './model';
import { SketchBlockInteraction } from './sketch-edgeless-block';
import { SketchSlashMenuConfigExtension } from './slash-menu';
import { createSketchToolbarConfigExtension } from './toolbar';

export const sketchWidget = registerGfxWidget({
  flavour: SketchBlockSchema.model.flavour,
  schema: SketchBlockSchemaExtension,
  view: {
    page: 'wb-sketch',
    edgeless: 'wb-sketch-edgeless',
    preview: 'wb-sketch-preview',
  },
  slash: SketchSlashMenuConfigExtension,
  toolbar: createSketchToolbarConfigExtension(SketchBlockSchema.model.flavour),
  clipboard: EdgelessClipboardSketchConfig,
  interaction: SketchBlockInteraction,
  adapter: SketchBlockHtmlAdapterExtension,
  snapshotPainter: props =>
    (props.snapshotSvgBlobId as string | undefined) ??
    (props.sceneBlobId as string | undefined),
});

export { sceneToExportedSvg } from './export';
export { sketchSceneFromImport } from './import';
export { getSketchLodLevel, liveSketchBudget } from './live-budget';
export { SketchBlockSchema, SketchBlockSchemaExtension } from './model';
export {
  isExcalidrawScene,
  parseExcalidrawJson,
  serializeScene,
} from './scene';
export { SketchBlockComponent } from './sketch-block';
export { SketchEdgelessBlockComponent } from './sketch-edgeless-block';
export { SketchPreviewBlockComponent } from './sketch-preview-block';
export { openSketchCollab } from './subdoc';
export {
  migrateSketchProps,
  SKETCH_SCHEMA_VERSION,
  SketchBlockTransformer,
} from './transformer';
export {
  applyElementsToY,
  applySceneToY,
  isNewerElement,
  reconcileSketchY,
  sceneFromY,
  yjsToExcalidraw,
} from './y-binding';
