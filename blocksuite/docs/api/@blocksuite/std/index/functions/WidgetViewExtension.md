[**BlockSuite API Documentation**](../../../../README.md)

***

[BlockSuite API Documentation](../../../../README.md) / [@blocksuite/std](../../README.md) / [index](../README.md) / WidgetViewExtension

# Function: WidgetViewExtension()

> **WidgetViewExtension**(`flavour`, `id`, `view`): `ExtensionType`

Create a widget view extension.

## Parameters

### flavour

`string`

The flavour of the block that the widget view is for.

### id

`string`

The id of the widget view.

### view

`StaticValue`

The widget view lit literal.

A widget view is to provide a widget view for a block.
For every target block, it's view will be rendered with the widget view.

## Returns

`ExtensionType`

## Example

```ts
import { WidgetViewExtension } from '@blocksuite/std';

const MyWidgetViewExtension = WidgetViewExtension('my-flavour', 'my-widget', literal`my-widget-view`);
