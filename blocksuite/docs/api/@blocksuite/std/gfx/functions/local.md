[**BlockSuite API Documentation**](../../../../README.md)

***

[BlockSuite API Documentation](../../../../README.md) / [@blocksuite/std](../../README.md) / [gfx](../README.md) / local

# Function: local()

> **local**\<`V`, `T`\>(): (`_target`, `context`) => `ClassAccessorDecoratorResult`\<`T`, `V`\>

A decorator to mark the property as a local property.

The local property act like it is a field property, but it's not synced to the Y map.
Updating local property will also trigger the `elementUpdated` slot of the surface model

## Type Parameters

### V

`V`

### T

`T` *extends* `GfxPrimitiveElementModel`\<`BaseElementProps`\>

## Returns

> (`_target`, `context`): `ClassAccessorDecoratorResult`\<`T`, `V`\>

### Parameters

#### \_target

`ClassAccessorDecoratorTarget`\<`T`, `V`\>

#### context

`ClassAccessorDecoratorContext`

### Returns

`ClassAccessorDecoratorResult`\<`T`, `V`\>
