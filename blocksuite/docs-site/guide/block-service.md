# Block Service

Each kind of block can register its own service, so as to define block-specific methods to be called during the editor lifecycle. The service is a class that extends the `BlockService` class:

```ts
import { BlockService } from '@blocksuite/block-std';
import { defineBlockSchema, type SchemaToModel } from '@blocksuite/store';

const myBlockSchema = defineBlockSchema({
  //...
});

type MyBlockModel = SchemaToModel<typeof myBlockSchema>;

class MyBlockService extends BlockService<MyBlockModel> {
  //...
}
```

For each block type, its service will only be instantiated once. And even though there is no block instance, the service will still be instantiated. So it's designed for defining editor-level methods for certain kind of block.

For example, if you want to bind certain hotkey for creating a new block, you can do it in the service:

```ts
class MyBlockService extends BlockService<MyBlockModel> {
  override mounted() {
    super.mounted();
    this.bindHotkey(
      {
        'Alt-1': this._addMyBlock,
      },
      { global: true }
    );
  }

  private _addMyBlock = () => {
    this.doc.addBlock('my-block', {});
  };
}
```

## Lifecycle Hooks

The `BlockService` class provides some lifecycle hooks for you to override.

- `mounted`: This hook will be called when the service is instantiated.
- `unmounted`: This hook will be called when the service is destroyed.

## Set Runtime Configs

Sometimes you may want to set some runtime configurations for some blocks to better fit your needs.

For example, you may want to set an image proxy middleware URL for the image block. By default the image block will use AFFiNE's image proxy to bypass CORS restrictions. In the self-hosted case, you may want to set your own image proxy middleware URL concerning that the default one will not be available:

```ts
import type { ImageService } from '@blocksuite/blocks';

const editorRoot = document.querySelector('editor-host');
if (!editorRoot) return;

const imageService = editorRoot.spec.getService('affine:image') as ImageService;

// Call specific method to set runtime configurations
imageService.setImageProxyURL('https://example.com/image-proxy');
```

For different blocks, the method to set runtime configurations may be different. You can check the [block API document](/api/@blocksuite/blocks/index) to find out the methods you need.
