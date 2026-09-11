import { registerGfxWidget } from '../../register-gfx-widget';
import { EdgelessClipboardHelloConfig } from './edgeless-clipboard-config';
import { HelloBlockInteraction } from './hello-edgeless-block';
import { HelloBlockSchema, HelloBlockSchemaExtension } from './model';
import { HelloSlashMenuConfigExtension } from './slash-menu';

export const helloWidget = registerGfxWidget({
  flavour: HelloBlockSchema.model.flavour,
  schema: HelloBlockSchemaExtension,
  view: {
    page: 'wb-hello',
    edgeless: 'wb-hello-edgeless',
    preview: 'wb-hello-preview',
  },
  slash: HelloSlashMenuConfigExtension,
  clipboard: EdgelessClipboardHelloConfig,
  interaction: HelloBlockInteraction,
});

export { HelloBlockComponent } from './hello-block';
export { HelloEdgelessBlockComponent } from './hello-edgeless-block';
export { HelloPreviewBlockComponent } from './hello-preview-block';
export { HelloBlockSchema, HelloBlockSchemaExtension } from './model';
