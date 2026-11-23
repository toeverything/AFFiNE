# Block Spec

In BlockSuite, a `BlockSpec` defines the structure and interactive elements for a specific block type within the editor. BlockSuite editors are typically composed entirely of block specs, with the top-level UI often implemented as a dedicated block, usually of the `affine:page` type.

A block spec contains the following properties:

- [`schema`](./block-schema): Defines the structure and data types for the block's content.
- [`service`](./block-service): Used for registering methods for specific actions and external invocations.
- [`view`](./block-view): Represents the visual representation and layout of the block.
  - `component`: The primary user interface element of the block.
  - `widgets`: Additional interactive elements enhancing the block's functionality.

![block-spec](../images/block-spec.png)

## Example

Note that in block spec, the definition of `view` is related to UI frameworks. By default, we provide a `@blocksuite/lit` package to help build a lit block view. But it's still possible to use other UI frameworks. We'll introduce later about how to write custom block renderers.

Here is a example of a lit-based block spec:

```ts
import type { BlockSpec } from '@blocksuite/block-std';
import { literal } from 'lit/static-html.js';

const MyBlockSepc: BlockSpec = {
  schema: MyBlockSchema,
  service: MyBlockService,
  view: {
    component: literal`my-block-component`,
    widgets: {
      myBlockToolbar: literal`my-block-toolbar`,
      myBlockMenu: literal`my-block-menu`,
    },
  },
};
```

We'll introduce each part of the block spec in the following sections.
