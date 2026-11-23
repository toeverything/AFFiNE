[**BlockSuite API Documentation**](../../../../README.md)

***

[BlockSuite API Documentation](../../../../README.md) / [@blocksuite/std](../../README.md) / [index](../README.md) / BlockViewExtension

# Function: BlockViewExtension()

> **BlockViewExtension**(`flavour`, `view`): `ExtensionType`

Create a block view extension.

## Parameters

### flavour

`string`

The flavour of the block that the view is for.

### view

`BlockViewType`

Lit literal template for the view. Example: `my-list-block`

The view is a lit template that is used to render the block.

## Returns

`ExtensionType`

## Example

```ts
import { BlockViewExtension } from '@blocksuite/std';

const MyListBlockViewExtension = BlockViewExtension(
  'affine:list',
  literal`my-list-block`
);
```
