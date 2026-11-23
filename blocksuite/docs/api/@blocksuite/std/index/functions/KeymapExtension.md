[**BlockSuite API Documentation**](../../../../README.md)

***

[BlockSuite API Documentation](../../../../README.md) / [@blocksuite/std](../../README.md) / [index](../README.md) / KeymapExtension

# Function: KeymapExtension()

> **KeymapExtension**(`keymapFactory`, `options?`): `ExtensionType`

Create a keymap extension.

## Parameters

### keymapFactory

(`std`) => `Record`\<`string`, `UIEventHandler`\>

Create keymap of the extension.
It should return an object with `keymap` and `options`.

`keymap` is a record of keymap.

### options?

`EventOptions`

`options` is an optional object that restricts the event to be handled.

## Returns

`ExtensionType`

## Example

```ts
import { KeymapExtension } from '@blocksuite/std';

const MyKeymapExtension = KeymapExtension(std => {
  return {
    keymap: {
      'mod-a': SelectAll
    }
    options: {
      flavour: 'affine:paragraph'
    }
  }
});
```
