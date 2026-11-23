[**BlockSuite API Documentation**](../../../README.md)

***

[BlockSuite API Documentation](../../../README.md) / [@blocksuite/store](../README.md) / StoreExtension

# Class: StoreExtension

Store extensions are used to extend the store.
They should be registered to the store. And they should be able to run in a none-dom environment.

## Extends

- [`Extension`](Extension.md)

## Properties

### key

> `readonly` `static` **key**: `string`

The key of the store extension.
**You must override this property with a unique string.**

## Methods

### disposed()

> **disposed**(): `void`

Lifecycle hook when the yjs document is disposed.

#### Returns

`void`

***

### loaded()

> **loaded**(): `void`

Lifecycle hook when the yjs document is loaded.

#### Returns

`void`
